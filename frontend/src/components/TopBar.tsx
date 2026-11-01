import { useSim } from '../store/simStore';
import { missionTime, pct } from '../app/format';
import { Icon } from './Icon';
import { Brand } from './Brand';
import { ThemeToggle } from './ThemeToggle';

export function TopBar({ onOpenObservatory, onExplain }: { onOpenObservatory?: () => void; onExplain?: () => void }) {
  useSim((s) => s.version);
  const engine = useSim((s) => s.engine);
  const status = useSim((s) => s.status);
  const explainUnavailable = useSim((s) => s.editingTerrain || s.editingSurvivors || s.dossierOpen || (s.controllerMode === 'ppo' && s.ppoPhase === 'connecting'));
  const openDossier = useSim((s) => s.openDossier);
  const labels = { ready: 'Ready to explore', running: 'Mission live', paused: 'Mission paused', complete: 'Mission complete' };
  return <header className="topbar">
    <div className="topbar-identity"><div className="brand"><Brand /></div><ThemeToggle /></div>
    <nav className="topbar-actions" aria-label="Mission tools">
    <button className="explain-launch" onClick={onExplain} disabled={explainUnavailable} aria-label="Explain the project" title={explainUnavailable ? 'Finish editing or let the mission connect, then open the story' : 'A simple, interactive story about our robots'}><span aria-hidden="true">ⓘ</span><span className="topbar-label">Explain</span></button>
    <button className="observatory-launch" onClick={onOpenObservatory} aria-label="Open swarm observatory" title="Open swarm observatory"><span className="ob-launch-spark" /><Icon name="signal" size={15} /><span className="topbar-label">Observatory</span></button>
    <a className="fieldbook-link" href="https://swarmsar.vercel.app" target="_blank" rel="noopener noreferrer" aria-label="Open the English audio fieldbook" title="Read and listen to the project fieldbook"><Icon name="book" size={16} /><span>Fieldbook</span></a>
    <button className="topbar-dossier-btn" onClick={openDossier} aria-label="Open rescue dossier" title="Open Rescue Dossier (P)"><Icon name="map" size={15} /><span>Dossier <kbd>P</kbd></span></button>
    </nav>
    <div className="mission-metrics" aria-label="Mission statistics">
      <div className="metric"><Icon name="person" size={18} /><div><span>Survivors found</span><strong>{engine.survivorsFound()} <small>/ {engine.scenario.victims.length}</small></strong></div></div>
      <div className="metric"><Icon name="map" size={18} /><div><span>Area explored</span><strong>{pct(engine.coverage())}</strong></div><div className="mini-progress"><i style={{ width: pct(engine.coverage()) }} /></div></div>
      <div className="metric metric-time"><Icon name="clock" size={18} /><div><span>Mission time</span><strong className="mono">{missionTime(engine.step)}</strong></div></div>
    </div>
    <div className={`mission-status status-${status}`}><span className="status-dot" />{labels[status]}</div>
  </header>;
}
