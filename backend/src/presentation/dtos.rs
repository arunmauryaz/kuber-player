use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize)]
pub struct UploadResponse {
    pub id: String,
    pub title: String,
    pub status: String,
}

#[derive(Debug, Deserialize)]
pub struct TrackEventRequest {
    pub video_id: String,
    pub event_type: String, // 'play', 'pause', 'seek', 'buffer', 'speed_change', 'complete', 'error'
    pub session_id: String,
    pub watch_time: Option<f64>,
    pub buffer_count: Option<i32>,
    pub buffer_duration: Option<f64>,
    pub seek_count: Option<i32>,
    pub playback_speed: Option<f64>,
    pub completion_percentage: Option<f64>,
    pub device_type: Option<String>,
    pub network_speed: Option<f64>,
    pub error_message: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct HealthResponse {
    pub status: String,
    pub database: String,
    pub storage: String,
}
