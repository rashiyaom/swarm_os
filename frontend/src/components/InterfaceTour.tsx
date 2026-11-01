import { useEffect, useRef, useState } from 'react';
import './welcome-guide.css';

export const WORKSPACE_TOUR = [
  { target: '.topbar-actions', title: 'Your project tools', text: 'Explain tells the rescue story. Observatory opens the live map, peer network and GNN illustration. Fieldbook is the audio guide; Dossier collects rescue routes and reports. The theme switch is beside the logo, and mission counters appear on larger screens.' },
  { target: '.rail-navigation', title: 'Choose a workspace', text: 'World returns to the map. Mission configures terrain, team, controller and radio. Fleet inspects individual robots. Activity shows mission events. These choices open an inspector on the right. Tutorial replays this guide; Controls lists shortcuts.' },
  { target: '.world-toolbar', title: 'Display and mission tools', text: 'From left to right: choose the controller, enable sound, adjust audio, hide the interface, inspect the fleet and open Layers. Layers reveal routes, radio links, messages, sensor evidence and robot labels. Everything starts off for a clear view.' },
  { target: '.camera-tools', title: 'Find your viewpoint', text: 'Switch between isometric 3D and top-down views. Zoom in or out and fit the world to the screen. You can also drag to orbit, right-drag to pan, scroll to zoom, or click a robot to inspect and follow it.' },
  { target: '.playback', title: 'Launch your first rescue', text: 'Launch or pause the team, change playback speed, follow mission time, or reset. Survivor discoveries pause the mission for a story; continue when you are ready. Next, choose whether to watch the project explanation.' },
];

export function InterfaceTour({ steps = WORKSPACE_TOUR, onDone, action = 'Continue' }: { steps?: typeof WORKSPACE_TOUR; onDone: () => void; action?: string }) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const dialog = useRef<HTMLDialogElement>(null);
  const step = steps[index];
  useEffect(() => {
    const el = dialog.current!;
    el.showModal();
    return () => el.close();
  }, []);
  useEffect(() => {
    const update = () => {
      const r = document.querySelector(step.target)?.getBoundingClientRect();
      if (r) setRect({ x: r.x, y: r.y, width: r.width, height: r.height });
    };
    update();
    window.addEventListener('resize', update);
    const observer = new ResizeObserver(update);
    observer.observe(document.body);
    dialog.current?.querySelector<HTMLButtonElement>('.welcome-primary')?.focus();
    return () => { window.removeEventListener('resize', update); observer.disconnect(); };
  }, [step]);
  const next = () => index === steps.length - 1 ? onDone() : setIndex(index + 1);
  const lower = rect.y < window.innerHeight / 2;
  const cardY = lower ? Math.max(rect.y + rect.height + 55, window.innerHeight * .45) : 28;
  const cardX = window.innerWidth / 2;
  return <dialog ref={dialog} className="interface-tour" aria-labelledby="tour-title" aria-describedby="tour-description" onCancel={(e) => { e.preventDefault(); onDone(); }}>
    <svg className="interface-tour-arrows" width="100%" height="100%" aria-hidden="true">
      <defs><marker id="tour-arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0 0 8 4 0 8" fill="none" stroke="currentColor" strokeWidth="1.5" /></marker></defs>
      <rect x={rect.x + 2} y={rect.y + 2} width={Math.max(0, rect.width - 4)} height={Math.max(0, rect.height - 4)} rx="10" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d={`M ${cardX} ${lower ? cardY - 10 : cardY + 225} Q ${cardX} ${rect.y + rect.height / 2} ${rect.x + rect.width / 2} ${lower ? rect.y + rect.height + 10 : rect.y - 10}`} fill="none" stroke="currentColor" strokeWidth="2" markerEnd="url(#tour-arrow)" />
    </svg>
    <section className="interface-tour-card" style={{ top: Math.min(cardY, window.innerHeight - 285) }}>
      <span className="welcome-eyebrow">WELCOME TO SWARM · {index + 1} / {steps.length}</span>
      <h1 id="tour-title">{step.title}</h1><p id="tour-description">{step.text}</p>
      <footer>{index > 0 ? <button className="welcome-secondary" onClick={() => setIndex(index - 1)}>Back</button> : <span>Follow the arrow on your screen</span>}<button className="welcome-primary" onClick={next}>{index === steps.length - 1 ? action : 'Next'} <span aria-hidden="true">→</span></button></footer>
    </section>
  </dialog>;
}
