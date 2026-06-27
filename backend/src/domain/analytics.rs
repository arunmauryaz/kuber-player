use serde::{Deserialize, Serialize};
use chrono::NaiveDateTime;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnalyticsEvent {
    pub id: Option<i64>,
    pub video_id: String,
    pub event_type: String, // 'play', 'pause', 'seek', 'buffer', 'speed_change', 'complete', 'error'
    pub session_id: String,
    pub watch_time: f64,
    pub buffer_count: i32,
    pub buffer_duration: f64,
    pub seek_count: i32,
    pub playback_speed: f64,
    pub completion_percentage: f64,
    pub device_type: Option<String>,
    pub network_speed: Option<f64>,
    pub error_message: Option<String>,
    pub created_at: Option<NaiveDateTime>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnalyticsSummary {
    pub total_views: i64,
    pub avg_watch_time: f64,
    pub avg_completion: f64,
    pub total_buffers: i64,
    pub avg_buffer_duration: f64,
    pub device_distribution: std::collections::HashMap<String, i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoAnalyticsSummary {
    pub video_id: String,
    pub total_plays: i64,
    pub unique_sessions: i64,
    pub total_watch_time: f64,
    pub avg_watch_time: f64,
    pub total_buffers: i64,
    pub avg_buffer_duration: f64,
    pub completion_rate: f64, // percentage of sessions with type 'complete'
    pub device_breakdown: serde_json::Value,
}

#[axum::async_trait]
pub trait AnalyticsRepository: Send + Sync {
    async fn record_event(&self, event: &AnalyticsEvent) -> Result<(), sqlx::Error>;
    async fn get_global_summary(&self) -> Result<AnalyticsSummary, sqlx::Error>;
    async fn get_video_summary(&self, video_id: &str) -> Result<Option<VideoAnalyticsSummary>, sqlx::Error>;
}
