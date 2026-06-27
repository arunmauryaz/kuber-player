use crate::presentation::handlers;
use crate::use_case::{VideoService, AnalyticsService};
use crate::infrastructure::storage::StorageManager;
use axum::{
    routing::{get, post, delete},
    Router,
    extract::{Path, State},
    response::IntoResponse,
};
use tower_http::cors::{Any, CorsLayer};
use std::sync::Arc;

#[derive(Clone)]
pub struct AppState {
    pub video_service: Arc<VideoService>,
    pub analytics_service: Arc<AnalyticsService>,
    pub storage: StorageManager,
}

pub fn create_router(state: AppState) -> Router {
    // Enable CORS for frontend players running on different domains/ports
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    Router::new()
        // Video Operations
        .route("/api/v1/upload", post(handlers::upload_video))
        .route("/api/v1/videos", get(handlers::list_videos))
        .route("/api/v1/video/:id", get(handlers::get_video).delete(handlers::delete_video))
        
        // Streaming Aliases (direct mapping)
        .route("/api/v1/video/:id/playlist", get(alias_playlist))
        .route("/api/v1/video/:id/thumbnail", get(alias_thumbnail))
        .route("/api/v1/video/:id/sprite", get(alias_sprite))
        .route("/api/v1/video/:id/captions", get(alias_captions))
        
        // Core HLS Stream server (serves variants and segments)
        .route("/api/v1/video/:id/stream/:file", get(handlers::serve_hls_stream))

        // Analytics Ingestion & Dashboard
        .route("/api/v1/events", post(handlers::track_event))
        .route("/api/v1/analytics", get(handlers::get_global_analytics))
        .route("/api/v1/video/:id/analytics", get(handlers::get_video_analytics))

        // System Health
        .route("/api/v1/system/health", get(handlers::system_health))
        
        .layer(cors)
        .with_state(state)
}

// Router aliases helper endpoints:
async fn alias_playlist(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    handlers::serve_hls_stream(State(state), Path((id, "master.m3u8".to_string()))).await
}

async fn alias_thumbnail(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    handlers::serve_hls_stream(State(state), Path((id, "poster.jpg".to_string()))).await
}

async fn alias_sprite(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    handlers::serve_hls_stream(State(state), Path((id, "sprite.vtt".to_string()))).await
}

async fn alias_captions(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    handlers::serve_hls_stream(State(state), Path((id, "captions.vtt".to_string()))).await
}
