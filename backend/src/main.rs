mod domain;
mod infrastructure;
mod use_case;
mod presentation;

use infrastructure::{SqliteDb, StorageManager, FfmpegTranscoder, VideoTranscoder};
use use_case::{JobQueue, VideoService, AnalyticsService};
use presentation::{create_router, AppState};

use sqlx::sqlite::SqlitePoolOptions;
use std::sync::Arc;
use std::net::SocketAddr;
use tracing::{info, error};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // 1. Initialize logging
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::new(
            std::env::var("RUST_LOG").unwrap_or_else(|_| "kuber_backend=info,info".into()),
        ))
        .with(tracing_subscriber::fmt::layer())
        .init();

    info!("Starting Kuber Player Backend Server...");

    // 2. Load configurations
    dotenvy::dotenv().ok();
    let port = std::env::var("PORT")
        .unwrap_or_else(|_| "8080".to_string())
        .parse::<u16>()
        .unwrap_or(8080);
    
    let db_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "sqlite:data/kuber.db".to_string());
    
    let ffmpeg_path = std::env::var("FFMPEG_PATH").unwrap_or_else(|_| "ffmpeg".to_string());
    let ffprobe_path = std::env::var("FFPROBE_PATH").unwrap_or_else(|_| "ffprobe".to_string());

    // 3. Initialize Storage
    let storage = StorageManager::new("data");
    storage.init_dirs()?;
    info!("Storage directories initialized under 'data/'.");

    // 4. Initialize Database
    // Ensure parent directories for SQLite db exist
    if db_url.starts_with("sqlite:") {
        let db_path_str = db_url.trim_start_matches("sqlite:");
        let db_path = std::path::Path::new(db_path_str);
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        if !db_path.exists() {
            std::fs::File::create(db_path)?;
            info!("Created SQLite database file: {:?}", db_path);
        }
    }

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect(&db_url)
        .await
        .map_err(|e| {
            error!("Failed to connect to SQLite: {:?}", e);
            e
        })?;

    let db_repo = SqliteDb::new(pool);
    db_repo.init_schema().await?;
    info!("Database schema initialized.");

    let db_arc = Arc::new(db_repo);

    // 5. Initialize Transcoder and Job Queue
    let transcoder = Arc::new(FfmpegTranscoder::new(&ffmpeg_path, &ffprobe_path, storage.clone()));
    let job_queue = JobQueue::new(db_arc.clone(), transcoder.clone(), storage.clone(), 100);

    // 6. Initialize Services
    let video_service = Arc::new(VideoService::new(db_arc.clone(), storage.clone(), job_queue));
    let analytics_service = Arc::new(AnalyticsService::new(db_arc.clone()));

    // 7. Start HTTP Server
    let state = AppState {
        video_service,
        analytics_service,
        storage,
    };

    let app = create_router(state);
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    info!("REST API server listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(&addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
