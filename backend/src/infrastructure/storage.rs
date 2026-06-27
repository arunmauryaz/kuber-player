use std::path::{Path, PathBuf};
use std::fs;
use std::io;

#[derive(Clone)]
pub struct StorageManager {
    base_dir: PathBuf,
}

impl StorageManager {
    pub fn new<P: AsRef<Path>>(base_dir: P) -> Self {
        Self {
            base_dir: base_dir.as_ref().to_path_buf(),
        }
    }

    pub fn init_dirs(&self) -> io::Result<()> {
        fs::create_dir_all(self.get_uploads_dir())?;
        fs::create_dir_all(self.get_streaming_dir())?;
        Ok(())
    }

    pub fn get_uploads_dir(&self) -> PathBuf {
        self.base_dir.join("uploads")
    }

    pub fn get_streaming_dir(&self) -> PathBuf {
        self.base_dir.join("streaming")
    }

    pub fn get_video_stream_dir(&self, video_id: &str) -> PathBuf {
        self.get_streaming_dir().join(video_id)
    }

    pub fn get_upload_path(&self, id: &str, ext: &str) -> PathBuf {
        self.get_uploads_dir().join(format!("{}.{}", id, ext))
    }

    pub fn delete_video_files(&self, video_id: &str) -> io::Result<()> {
        // Delete HLS stream directory
        let stream_dir = self.get_video_stream_dir(video_id);
        if stream_dir.exists() {
            fs::remove_dir_all(stream_dir)?;
        }

        // Delete raw upload files if any match the video_id in the uploads folder
        let uploads_dir = self.get_uploads_dir();
        if uploads_dir.exists() {
            for entry in fs::read_dir(uploads_dir)? {
                let entry = entry?;
                let path = entry.path();
                if path.is_file() {
                    if let Some(stem) = path.file_stem() {
                        if stem == video_id {
                            let _ = fs::remove_file(path);
                        }
                    }
                }
            }
        }

        Ok(())
    }
}
