use crate::domain::analytics::{AnalyticsEvent, AnalyticsSummary, VideoAnalyticsSummary, AnalyticsRepository};
use std::sync::Arc;

pub struct AnalyticsService {
    db: Arc<dyn AnalyticsRepository>,
}

impl AnalyticsService {
    pub fn new(db: Arc<dyn AnalyticsRepository>) -> Self {
        Self { db }
    }

    pub async fn track_event(&self, event: AnalyticsEvent) -> Result<(), sqlx::Error> {
        self.db.record_event(&event).await
    }

    pub async fn get_global_stats(&self) -> Result<AnalyticsSummary, sqlx::Error> {
        self.db.get_global_summary().await
    }

    pub async fn get_video_stats(&self, video_id: &str) -> Result<Option<VideoAnalyticsSummary>, sqlx::Error> {
        self.db.get_video_summary(video_id).await
    }
}
