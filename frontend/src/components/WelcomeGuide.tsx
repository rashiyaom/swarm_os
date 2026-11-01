import { useEffect, useRef, useState } from 'react';
import { Brand } from './Brand';
import './welcome-guide.css';
import { InterfaceTour } from './InterfaceTour';

const SEEN_KEY = 'swarm-welcome-v1';

export function WelcomeGuide({ onExplain, onObservatory }: { onExplain: () => void; onObservatory: () => void }) {
  const [step, setStep] = useState<'map' | 'choice' | 'confirm' | 'observatory' | 'done'>(() => {
    try { return localStorage.getItem(SEEN_KEY) ? 'done' : 'map'; } catch { return 'map'; }
  });
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const replay = () => setStep('map');
    const invite = () => setStep('observatory');
    window.addEventListener('swarm-tutorial', replay);
    window.addEventListener('swarm-observatory-invite', invite);
    return () => { window.removeEventListener('swarm-tutorial', replay); window.removeEventListener('swarm-observatory-invite', invite); };
  }, []);
  useEffect(() => {
    const element = dialog.current;
    if (step === 'done' || step === 'map' || !element) return;
    if (!element.open) element.showModal();
    element.querySelector<HTMLButtonElement>('.welcome-primary')?.focus();
    return () => { element.close(); };
  }, [step]);
  const finish = (explain: boolean) => {
    try { localStorage.setItem(SEEN_KEY, 'complete'); } catch { /* Optional browser storage. */ }
    dialog.current?.close();
    setStep('done');
    if (explain) onExplain();
    else requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('.launch-button')?.focus());
  };
  if (step === 'done') return null;
  if (step === 'map') return <InterfaceTour onDone={() => setStep('choice')} />;
  if (step === 'observatory') return <dialog ref={dialog} className="welcome-guide" aria-labelledby="welcome-title" onCancel={() => setStep('done')}>
    <p className="welcome-eyebrow">YOUR NEXT VIEW</p><h1 id="welcome-title">View our Observatory</h1><p id="welcome-description">Explore the swarm in motion, inspect peer messages, and discover the GNN concept. We’ll show you its Explain button for a guided tour.</p><footer><button className="welcome-secondary" onClick={() => setStep('done')}>Stay in mission</button><button className="welcome-primary" onClick={() => { setStep('done'); onObservatory(); }}>View Observatory →</button></footer>
  </dialog>;
  return <dialog ref={dialog} className="welcome-guide" aria-labelledby="welcome-title" aria-describedby="welcome-description" onCancel={(event) => { event.preventDefault(); setStep(step === 'confirm' ? 'choice' : 'confirm'); }}>
    <header><Brand /><span>YOUR FIRST MISSION</span></header>
    <>
      <p className="welcome-eyebrow">{step === 'confirm' ? 'EXPLORE AT YOUR OWN PACE' : 'A GUIDED FIRST LOOK'}</p>
      <h1 id="welcome-title">{step === 'confirm' ? 'Skip the explanation?' : 'New to the project?'}</h1>
      <p id="welcome-description">{step === 'confirm' ? 'You can start exploring now and open Explain in the top panel whenever you like.' : 'Follow an interactive rescue story to see how sensing, shared maps, communication and robot decisions work together. You control the pace.'}</p>
      <div className="welcome-story-preview"><span aria-hidden="true">01 → 02 → 03</span><strong>Meet the robots. Follow the signals. Understand the rescue.</strong><p>The guided story uses its own demonstration and returns you to your mission afterwards.</p></div>
      <footer><button className="welcome-secondary" onClick={() => step === 'confirm' ? finish(false) : setStep('confirm')}>{step === 'confirm' ? 'Yes, skip and explore' : 'Don’t view explanation'}</button><button className="welcome-primary" onClick={() => finish(true)}>{step === 'confirm' ? 'No, show explanation' : 'View explanation'} <span aria-hidden="true">→</span></button></footer>
    </>
  </dialog>;
}
