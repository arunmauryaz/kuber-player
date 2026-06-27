use crate::domain::video::{Video, VideoStatus, Chapter, VideoRepository};
use crate::domain::analytics::{AnalyticsEvent, AnalyticsSummary, VideoAnalyticsSummary, AnalyticsRepository};
use sqlx::{SqlitePool, Row};
use std::collections::HashMap;

#[derive(Clone)]
pub struct SqliteDb {
    pub pool: SqlitePool,
}

impl SqliteDb {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn init_schema(&self) -> Result<(), sqlx::Error> {
        sqlx::query(
            "CREATE TABLE IF NOT EXISTS videos (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                filename TEXT NOT NULL,
                status TEXT NOT NULL,
                duration REAL DEFAULT 0.0,
                width INTEGER,
                height INTEGER,
                bitrate INTEGER,
                codec TEXT,
                size INTEGER NOT NULL,
                error_message TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );"
        )
        .execute(&self.pool)
        .await?;

        sqlx::query(
            "CREATE TABLE IF NOT EXISTS chapters (
                id TEXT PRIMARY KEY,
                video_id TEXT NOT NULL,
                title TEXT NOT NULL,
                start_time REAL NOT NULL,
                end_time REAL NOT NULL,
                FOREIGN KEY(video_id) REFERENCES videos(id) ON DELETE CASCADE
            );"
        )
        .execute(&self.pool)
        .await?;

        sqlx::query(
            "CREATE TABLE IF NOT EXISTS analytics_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                video_id TEXT NOT NULL,
                event_type TEXT NOT NULL,
                session_id TEXT NOT NULL,
                watch_time REAL DEFAULT 0.0,
                buffer_count INTEGER DEFAULT 0,
                buffer_duration REAL DEFAULT 0.0,
                seek_count INTEGER DEFAULT 0,
                playback_speed REAL DEFAULT 1.0,
                completion_percentage REAL DEFAULT 0.0,
                device_type TEXT,
                network_speed REAL,
                error_message TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(video_id) REFERENCES videos(id) ON DELETE CASCADE
            );"
        )
        .execute(&self.pool)
        .await?;

        Ok(())
    }
}

#[axum::async_trait]
impl VideoRepository for SqliteDb {
    async fn create(&self, video: &Video) -> Result<(), sqlx::Error> {
        sqlx::query(
            "INSERT INTO videos (id, title, filename, status, duration, width, height, bitrate, codec, size, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(&video.id)
        .bind(&video.title)
        .bind(&video.filename)
        .bind(video.status.as_str())
        .bind(video.duration)
        .bind(video.width)
        .bind(video.height)
        .bind(video.bitrate)
        .bind(&video.codec)
        .bind(video.size)
        .bind(video.created_at)
        .bind(video.updated_at)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    async fn find_by_id(&self, id: &str) -> Result<Option<Video>, sqlx::Error> {
        let row = sqlx::query("SELECT id, title, filename, status, duration, width, height, bitrate, codec, size, error_message, created_at, updated_at FROM videos WHERE id = ?")
            .bind(id)
            .fetch_optional(&self.pool)
            .await?;

        if let Some(r) = row {
            let status_str: String = r.get("status");
            Ok(Some(Video {
                id: r.get("id"),
                title: r.get("title"),
                filename: r.get("filename"),
                status: VideoStatus::from(status_str),
                duration: r.get("duration"),
                width: r.get("width"),
                height: r.get("height"),
                bitrate: r.get("bitrate"),
                codec: r.get("codec"),
                size: r.get("size"),
                error_message: r.get("error_message"),
                created_at: r.get("created_at"),
                updated_at: r.get("updated_at"),
            }))
        } else {
            Ok(None)
        }
    }

    async fn list_all(&self) -> Result<Vec<Video>, sqlx::Error> {
        let rows = sqlx::query("SELECT id, title, filename, status, duration, width, height, bitrate, codec, size, error_message, created_at, updated_at FROM videos ORDER BY created_at DESC")
            .fetch_all(&self.pool)
            .await?;

        let mut videos = Vec::new();
        for r in rows {
            let status_str: String = r.get("status");
            videos.push(Video {
                id: r.get("id"),
                title: r.get("title"),
                filename: r.get("filename"),
                status: VideoStatus::from(status_str),
                duration: r.get("duration"),
                width: r.get("width"),
                height: r.get("height"),
                bitrate: r.get("bitrate"),
                codec: r.get("codec"),
                size: r.get("size"),
                error_message: r.get("error_message"),
                created_at: r.get("created_at"),
                updated_at: r.get("updated_at"),
            });
        }
        Ok(videos)
    }

    async fn update_status(&self, id: &str, status: VideoStatus, error_message: Option<&str>) -> Result<(), sqlx::Error> {
        sqlx::query("UPDATE videos SET status = ?, error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
            .bind(status.as_str())
            .bind(error_message)
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    async fn update_metadata(&self, id: &str, duration: f64, width: i32, height: i32, bitrate: i64, codec: &str) -> Result<(), sqlx::Error> {
        sqlx::query("UPDATE videos SET duration = ?, width = ?, height = ?, bitrate = ?, codec = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
            .bind(duration)
            .bind(width)
            .bind(height)
            .bind(bitrate)
            .bind(codec)
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    async fn delete(&self, id: &str) -> Result<(), sqlx::Error> {
        sqlx::query("DELETE FROM videos WHERE id = ?")
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    async fn add_chapter(&self, chapter: &Chapter) -> Result<(), sqlx::Error> {
        sqlx::query("INSERT INTO chapters (id, video_id, title, start_time, end_time) VALUES (?, ?, ?, ?, ?)")
            .bind(&chapter.id)
            .bind(&chapter.video_id)
            .bind(&chapter.title)
            .bind(chapter.start_time)
            .bind(chapter.end_time)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    async fn find_chapters_by_video_id(&self, video_id: &str) -> Result<Vec<Chapter>, sqlx::Error> {
        let rows = sqlx::query("SELECT id, video_id, title, start_time, end_time FROM chapters WHERE video_id = ? ORDER BY start_time ASC")
            .bind(video_id)
            .fetch_all(&self.pool)
            .await?;

        let mut chapters = Vec::new();
        for r in rows {
            chapters.push(Chapter {
                id: r.get("id"),
                video_id: r.get("video_id"),
                title: r.get("title"),
                start_time: r.get("start_time"),
                end_time: r.get("end_time"),
            });
        }
        Ok(chapters)
    }
}

#[axum::async_trait]
impl AnalyticsRepository for SqliteDb {
    async fn record_event(&self, event: &AnalyticsEvent) -> Result<(), sqlx::Error> {
        sqlx::query(
            "INSERT INTO analytics_events (video_id, event_type, session_id, watch_time, buffer_count, buffer_duration, seek_count, playback_speed, completion_percentage, device_type, network_speed, error_message)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(&event.video_id)
        .bind(&event.event_type)
        .bind(&event.session_id)
        .bind(event.watch_time)
        .bind(event.buffer_count)
        .bind(event.buffer_duration)
        .bind(event.seek_count)
        .bind(event.playback_speed)
        .bind(event.completion_percentage)
        .bind(&event.device_type)
        .bind(event.network_speed)
        .bind(&event.error_message)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    async fn get_global_summary(&self) -> Result<AnalyticsSummary, sqlx::Error> {
        // Count total views (unique session plays)
        let total_views: i64 = sqlx::query_scalar("SELECT COUNT(DISTINCT session_id) FROM analytics_events WHERE event_type = 'play'")
            .fetch_one(&self.pool)
            .await
            .unwrap_or(0);

        // Calculate average watch time per session (sum watch_time grouped by session_id, then average it)
        let avg_watch_time: f64 = sqlx::query_scalar(
            "SELECT COALESCE(AVG(session_watch_time), 0.0) FROM (SELECT SUM(watch_time) as session_watch_time FROM analytics_events GROUP BY session_id)"
        )
        .fetch_one(&self.pool)
        .await
        .unwrap_or(0.0);

        // Average completion percentage of sessions
        let avg_completion: f64 = sqlx::query_scalar(
            "SELECT COALESCE(AVG(max_completion), 0.0) FROM (SELECT MAX(completion_percentage) as max_completion FROM analytics_events GROUP BY session_id)"
        )
        .fetch_one(&self.pool)
        .await
        .unwrap_or(0.0);

        // Sum of all buffers
        let total_buffers: i64 = sqlx::query_scalar("SELECT COALESCE(SUM(buffer_count), 0) FROM analytics_events")
            .fetch_one(&self.pool)
            .await
            .unwrap_or(0);

        // Average buffer duration per buffer event
        let avg_buffer_duration: f64 = sqlx::query_scalar("SELECT COALESCE(AVG(buffer_duration), 0.0) FROM analytics_events WHERE buffer_duration > 0")
            .fetch_one(&self.pool)
            .await
            .unwrap_or(0.0);

        // Device distribution
        let rows = sqlx::query("SELECT COALESCE(device_type, 'unknown') as device, COUNT(DISTINCT session_id) as count FROM analytics_events GROUP BY device")
            .fetch_all(&self.pool)
            .await?;

        let mut device_distribution = HashMap::new();
        for r in rows {
            let device: String = r.get("device");
            let count: i64 = r.get("count");
            device_distribution.insert(device, count);
        }

        Ok(AnalyticsSummary {
            total_views,
            avg_watch_time,
            avg_completion,
            total_buffers,
            avg_buffer_duration,
            device_distribution,
        })
    }

    async fn get_video_summary(&self, video_id: &str) -> Result<Option<VideoAnalyticsSummary>, sqlx::Error> {
        // Verify video exists
        let exists: i64 = sqlx::query_scalar("SELECT COUNT(1) FROM videos WHERE id = ?")
            .bind(video_id)
            .fetch_one(&self.pool)
            .await
            .unwrap_or(0);

        if exists == 0 {
            return Ok(None);
        }

        let total_plays: i64 = sqlx::query_scalar("SELECT COUNT(1) FROM analytics_events WHERE video_id = ? AND event_type = 'play'")
            .bind(video_id)
            .fetch_one(&self.pool)
            .await
            .unwrap_or(0);

        let unique_sessions: i64 = sqlx::query_scalar("SELECT COUNT(DISTINCT session_id) FROM analytics_events WHERE video_id = ?")
            .bind(video_id)
            .fetch_one(&self.pool)
            .await
            .unwrap_or(0);

        let total_watch_time: f64 = sqlx::query_scalar("SELECT COALESCE(SUM(watch_time), 0.0) FROM analytics_events WHERE video_id = ?")
            .bind(video_id)
            .fetch_one(&self.pool)
            .await
            .unwrap_or(0.0);

        let avg_watch_time: f64 = sqlx::query_scalar(
            "SELECT COALESCE(AVG(session_watch_time), 0.0) FROM (SELECT SUM(watch_time) as session_watch_time FROM analytics_events WHERE video_id = ? GROUP BY session_id)"
        )
        .bind(video_id)
        .fetch_one(&self.pool)
        .await
        .unwrap_or(0.0);

        let total_buffers: i64 = sqlx::query_scalar("SELECT COALESCE(SUM(buffer_count), 0) FROM analytics_events WHERE video_id = ?")
            .bind(video_id)
            .fetch_one(&self.pool)
            .await
            .unwrap_or(0);

        let avg_buffer_duration: f64 = sqlx::query_scalar("SELECT COALESCE(AVG(buffer_duration), 0.0) FROM analytics_events WHERE video_id = ? AND buffer_duration > 0")
            .bind(video_id)
            .fetch_one(&self.pool)
            .await
            .unwrap_or(0.0);

        // Completion rate: % of sessions that ended with a 'complete' event (or completion_percentage >= 95%)
        let total_sessions_grouped: f64 = sqlx::query_scalar("SELECT COUNT(DISTINCT session_id) FROM analytics_events WHERE video_id = ?")
            .bind(video_id)
            .fetch_one(&self.pool)
            .await
            .unwrap_or(0) as f64;

        let completed_sessions: f64 = sqlx::query_scalar(
            "SELECT COUNT(DISTINCT session_id) FROM analytics_events WHERE video_id = ? AND (event_type = 'complete' OR completion_percentage >= 95.0)"
        )
        .bind(video_id)
        .fetch_one(&self.pool)
        .await
        .unwrap_or(0) as f64;

        let completion_rate = if total_sessions_grouped > 0.0 {
            (completed_sessions / total_sessions_grouped) * 100.0
        } else {
            0.0
        };

        // Device breakdown
        let device_rows = sqlx::query("SELECT COALESCE(device_type, 'unknown') as device, COUNT(DISTINCT session_id) as count FROM analytics_events WHERE video_id = ? GROUP BY device")
            .bind(video_id)
            .fetch_all(&self.pool)
            .await?;

        let mut device_map = serde_json::Map::new();
        for r in device_rows {
            let device: String = r.get("device");
            let count: i64 = r.get("count");
            device_map.insert(device, serde_json::Value::Number(count.into()));
        }

        Ok(Some(VideoAnalyticsSummary {
            video_id: video_id.to_string(),
            total_plays,
            unique_sessions,
            total_watch_time,
            avg_watch_time,
            total_buffers,
            avg_buffer_duration,
            completion_rate,
            device_breakdown: serde_json::Value::Object(device_map),
        }))
    }
}
