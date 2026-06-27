import React, { useState } from 'react';
import { KuberPlayerReact } from '../../frontend/src/wrappers/ReactWrapper';
import { WatermarkPlugin } from '../../frontend/src/plugins/WatermarkPlugin';
import { HeatmapPlugin } from '../../frontend/src/plugins/HeatmapPlugin';

export const App: React.FC = () => {
  const [activeVideoId, setActiveVideoId] = useState('video-123-abc');
  const [autoplay, setAutoplay] = useState(true);

  // Instantiated plugins wrapped in state or memo
  const plugins = [
    new WatermarkPlugin({ text: 'CONFIDENTIAL PREVIEW', opacity: 0.15 }),
    new HeatmapPlugin()
  ];

  return (
    <div style={{ maxWidth: '960px', margin: '40px auto', padding: '0 20px', fontFamily: 'system-ui, sans-serif' }}>
      <header style={{ marginBottom: '30px' }}>
        <h1 style={{ fontSize: '1.8rem', fontWeight: 700 }}>React Application Integration</h1>
        <p style={{ color: '#666' }}>Consuming the Kuber Player SDK React Wrapper.</p>
      </header>

      <div style={{ borderRadius: '12px', overflow: 'hidden', border: '1px solid #ddd', marginBottom: '24px' }}>
        <KuberPlayerReact
          src={`http://localhost:8080/api/v1/video/${activeVideoId}/playlist`}
          poster={`http://localhost:8080/api/v1/video/${activeVideoId}/thumbnail`}
          spriteVtt={`http://localhost:8080/api/v1/video/${activeVideoId}/sprite`}
          autoplay={autoplay}
          muted={false}
          plugins={plugins}
        />
      </div>

      <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
        <button 
          onClick={() => setActiveVideoId('video-123-abc')}
          style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #ccc', cursor: 'pointer' }}
        >
          Load Stream A
        </button>
        <button 
          onClick={() => setActiveVideoId('video-456-xyz')}
          style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #ccc', cursor: 'pointer' }}
        >
          Load Stream B
        </button>
        <label style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem' }}>
          <input 
            type="checkbox" 
            checked={autoplay} 
            onChange={(e) => setAutoplay(e.target.checked)} 
          />
          Enable Autoplay
        </label>
      </div>
    </div>
  );
};
export default App;
