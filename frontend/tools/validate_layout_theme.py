"""Viewport containment and sampled computed-style contrast in actual Chrome.
Requires a running frontend and Playwright; never connects a real ROS host.
"""
import argparse
import json
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
parser=argparse.ArgumentParser(description='Real browser layout and sampled dark-theme contrast regression.')
parser.add_argument('--url',default='http://127.0.0.1:5173')
parser.add_argument('--browser-executable')
parser.add_argument('--output',default='artifacts/frontend-layout-theme')
args=parser.parse_args()
out=Path(args.output);out.mkdir(parents=True,exist_ok=True)
contrast=r'''(scope)=>{
 const rgb=s=>{const m=s.match(/[\d.]+/g);return m?[+m[0],+m[1],+m[2],m[3]===undefined?1:+m[3]]:[0,0,0,0]};
 const lum=c=>c.slice(0,3).map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4}).reduce((s,x,i)=>s+x*[.2126,.7152,.0722][i],0);
 const bg=e=>{if(!e)return [18,26,23,1];const c=rgb(getComputedStyle(e).backgroundColor);const b=c[3]<1?bg(e.parentElement):[0,0,0,1];return c.slice(0,3).map((v,i)=>v*c[3]+b[i]*(1-c[3])).concat(1)};
 return [...document.querySelectorAll(scope+' *')].filter(e=>e.getClientRects().length&&e.textContent.trim()&&[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())&&!e.closest('button:disabled,[aria-disabled=true],svg')&&getComputedStyle(e).opacity==='1').map(e=>{const c=getComputedStyle(e),f=rgb(c.color),b=bg(e);const r=(Math.max(lum(f),lum(b))+.05)/(Math.min(lum(f),lum(b))+.05);return {text:e.textContent.trim().slice(0,55),selector:e.className,ratio:+r.toFixed(2),fg:c.color,bg:b.slice(0,3)}}).filter(x=>x.ratio<4.45);
}'''
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=args.browser_executable,channel=None if args.browser_executable else 'chrome',headless=True,args=['--enable-unsafe-swiftshader'])
 page=b.new_page(viewport={'width':1280,'height':800},color_scheme='dark');page.set_default_timeout(25000);errors=[];checks=[];failures={};page.on('pageerror',lambda e:errors.append(str(e)))
 # Onboarding has its own regression script; keep it from covering the controls here.
 page.add_init_script("localStorage.setItem('swarm-welcome-v1', 'complete')")
 def dark():
  page.get_by_role('button',name='Switch to dark mode',exact=True).click()
  assert page.locator('html').get_attribute('data-theme') == 'dark'
 page.goto(args.url+'/');expect(page.locator('.topbar')).to_be_visible()
 assert page.evaluate('CSS.supports("color","light-dark(white, black)")')
 for width,height in [(1920,1080),(1440,900),(1280,800),(1024,768),(900,650),(768,600),(390,844),(320,700)]:
  page.set_viewport_size({'width':width,'height':height});page.wait_for_timeout(100)
  sizes=page.locator('.topbar').evaluate('(e)=>[e.clientWidth,e.scrollWidth]');assert sizes[1]<=sizes[0]+1,('header overflow',width,sizes)
  rects=page.locator('.topbar-actions button,.topbar-actions a,.topbar .theme-toggle').evaluate_all('(es)=>es.filter(e=>e.getClientRects().length).map(e=>{const r=e.getBoundingClientRect();return [r.left,r.right]})');assert all(0<=l<r<=width for l,r in rects),(width,rects)
 checks.append('header and essential controls fit eight viewport sizes')
 page.set_viewport_size({'width':1280,'height':800});page.reload();expect(page.locator('.topbar')).to_be_visible();dark();page.wait_for_timeout(500);page.screenshot(path=str(out/'world-dark.png'))
 for panel in ['mission','fleet','activity','controls']:
  page.get_by_role('button',name='Open '+panel+(' guide' if panel=='controls' else ' panel'),exact=True).click();page.wait_for_timeout(100)
  failures[panel]=page.evaluate(contrast,'.workspace-drawer');
  if panel=='mission':page.screenshot(path=str(out/'mission-dark.png'))
  page.get_by_role('button',name='Close panel',exact=True).click()
 page.get_by_role('button',name='Layers',exact=True).click();failures['layers']=page.evaluate(contrast,'.layer-menu');page.get_by_role('button',name='Layers',exact=True).click()
 page.locator('.explain-launch').click();expect(page.locator('.ex-story-content')).to_be_visible();failures['explain']=page.evaluate(contrast,'.ex-story-pane');failures['story_navigation']=page.evaluate(contrast,'.ex-footer');page.wait_for_timeout(500);page.screenshot(path=str(out/'explain-dark.png'))
 page.goto(args.url+'/');expect(page.locator('.topbar')).to_be_visible();dark()
 page.evaluate("async()=>{window.store=(await import(performance.getEntriesByType('resource').find(e=>e.name.includes('/src/store/simStore.ts')).name)).useSim;store.getState().select(store.getState().engine.robots[0].name)}")
 page.wait_for_timeout(150);failures['selected_fleet']=page.evaluate(contrast,'.workspace-drawer');page.get_by_role('button',name='Close panel',exact=True).click()
 page.get_by_role('button',name='Sound settings',exact=True).click();failures['audio']=page.evaluate(contrast,'.sound-panel');page.get_by_role('button',name='Sound settings',exact=True).click()
 page.evaluate('store.getState().setEditingTerrain(true)');failures['map_editor']=page.evaluate(contrast,'.maze-editor');page.get_by_role('button',name='Cancel',exact=True).click()
 page.evaluate('''()=>{const s=store.getState();s.launch();for(let i=0;i<1000&&!store.getState().encounter;i++)s.advance(8)}''');expect(page.locator('.encounter-card')).to_be_visible();failures['survivor_story']=page.evaluate(contrast,'.encounter-card');page.screenshot(path=str(out/'survivor-dark.png'))
 page.evaluate('''()=>{const s=store.getState();for(let i=0;i<2000&&store.getState().status!=='complete';i++){if(store.getState().encounter)s.continueExploration();s.advance(8)}s.openDossier()}''');page.wait_for_timeout(350);failures['dossier']=page.evaluate(contrast,'.dossier-modal');page.screenshot(path=str(out/'dossier-dark.png'));page.locator('.survivor-table-row').first.click();failures['selected_survivor_report']=page.evaluate(contrast,'.dossier-modal')
 page.set_viewport_size({'width':390,'height':844});assert page.locator('.dossier-body').evaluate('(e)=>e.scrollWidth<=e.clientWidth');page.keyboard.press('Escape');page.screenshot(path=str(out/'mobile-dark.png'))
 page.set_viewport_size({'width':1280,'height':800})
 page.goto(args.url+'/?mode=observatory');expect(page.locator('.ob-view-switch')).to_be_visible();dark();page.get_by_role('button',name='GNN concept',exact=True).click();failures['gnn']=page.evaluate(contrast,'.ob-gnn-panel');page.screenshot(path=str(out/'gnn-dark.png'))
 page.goto(args.url+'/?mode=ros');expect(page.locator('.ob-header')).to_be_visible();dark();page.get_by_role('button',name='Connect ROS bridge',exact=True).click();failures['ros']=page.evaluate(contrast,'.ob-connection-modal');page.screenshot(path=str(out/'ros-dark.png'))
 assert not errors,errors
 assert not any(failures.values()),failures
 (out/'audit.json').write_text(json.dumps({'checks':checks,'contrast_failures':failures,'js_errors':errors},indent=2));print(json.dumps({'checks':checks,'contrast_failures':failures,'js_errors':errors}));b.close()
