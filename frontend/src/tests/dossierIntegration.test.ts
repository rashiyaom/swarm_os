import { useSim } from '../store/simStore';
import { buildDossier } from '../dossier/buildDossier';
import { beginExplainSession } from '../explain/session';

const initial = useSim.getState();
beforeEach(() => { useSim.setState(initial, true); useSim.getState().reset(); });
afterEach(() => useSim.setState(initial, true));

describe('Rescue dossier integration', () => {
  it('pauses without advancing or mutating a mission, blocks playback and Explain until closed', () => {
    const state = useSim.getState(); state.launch(); state.advance(2);
    const hash = state.engine.stateHash(), step = state.engine.step;
    state.openDossier(); state.resume(); state.advance(100);
    expect(useSim.getState().status).toBe('paused');
    expect(state.engine.stateHash()).toBe(hash);
    expect(beginExplainSession()).toBeNull();
    expect(buildDossier(state.engine).meta.missionDurationSeconds).toBe(step);
    state.closeDossier(); expect(useSim.getState().status).toBe('paused');
    state.resume(); expect(useSim.getState().status).toBe('running');
  });

  it('keeps each discovered survivor story ahead of the dossier and requires explicit continuation', () => {
    const state = useSim.getState(); state.launch();
    const seen: number[] = [];
    for (let guard = 0; guard < 2000 && useSim.getState().status !== 'complete'; guard++) {
      state.advance(8); const current = useSim.getState();
      if (!current.encounter) continue;
      seen.push(current.encounter.id);
      const hash = state.engine.stateHash();
      state.openDossier(); state.resume(); state.advance(50);
      expect(useSim.getState().dossierOpen).toBe(false);
      expect(useSim.getState().encounter?.id).toBe(current.encounter.id);
      expect(state.engine.stateHash()).toBe(hash);
      state.continueExploration();
    }
    expect(seen.length).toBe(state.engine.scenario.victims.length);
    expect(new Set(seen).size).toBe(seen.length);
    state.openDossier(); expect(useSim.getState().dossierOpen).toBe(true);
    expect(buildDossier(state.engine).survivors.filter(s => s.status === 'CONFIRMED')).toHaveLength(seen.length);
    state.reset(); expect(useSim.getState().dossierOpen).toBe(false);
  });
});
