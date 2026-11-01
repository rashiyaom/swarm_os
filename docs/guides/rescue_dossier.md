# Rescue dossier

Integrated from `human_map` (`fcf2893`) into the current application locally.

Open **Dossier** in the simulator header or press **P**. The report combines the
robots' explored beliefs, confirmed survivors, suspected sensor cues, ingress
routes, fleet status and limitations. Select a survivor row (click, Enter or Space)
for a route card and turn-by-turn directions. Known-free map cells can be selected
to change the entry point. HTML and JSON downloads and browser Print/PDF remain
available. The optional **Safe rescue routes** layer draws routes in the 3D world.

The document is an operator view of merged robot knowledge. It does not inject
that merged map into a robot's policy. Routes are suggestions within the simulated
map, not validated field safety or a certified incident plan. Suspected cues remain
separate from confirmed survivor records.

## Survivor stories and playback

Each new survivor pauses exploration and opens the existing fictional survivor
conversation. Only **Continue exploration** advances that flow; simultaneous
confirmations are shown one at a time. The dossier cannot replace a pending story.
The final **View mission report** opens the dossier after the final story is
acknowledged. Existing Explain mode and observatory tours remain available.

Opening the dossier pauses an active mission. Closing it leaves the mission paused;
resume explicitly after reviewing. Mission reset closes the report. Its elapsed time
uses mission steps, independent of the rendering/playback rate.

## Interface and validation

The dossier uses the official brand, sage/paper surfaces, rounded panels, subtle
depth and existing light/dark theme tokens. Its generic styles are scoped to the
report, and mobile stat cards use a two-column layout. Keyboard focus stays inside
the modal and returns to the invoking control on close.

- Frontend: **179 tests passed**, including the branch's 20 report/export tests and
  two integration regressions covering dossier isolation and survivor-story order.
- TypeScript/Vite production build passed.
- Real Chrome: three real discoveries each showed their story; ordinary playback
  could not bypass a story; final report opened; JSON/standalone HTML downloaded;
  mission duration matched tick count; mobile report body had no horizontal
  overflow; light/dark screenshots and browser PDF generated; no JavaScript errors.
- Browser mission used seed 7: survivor IDs **2, 0, 1** were acknowledged once each.
  The exported dossier had **three confirmed records plus one suspected cue**.

[Light desktop](../media/rescue-dossier/desktop-light.png) ·
[Dark desktop](../media/rescue-dossier/desktop-dark.png) ·
[Dark mobile](../media/rescue-dossier/mobile-dark.png)
