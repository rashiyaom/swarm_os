"""Exercise onboarding branches, keyboard isolation, startup and mobile layout."""
import argparse
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://127.0.0.1:5193')
args = parser.parse_args()
with sync_playwright() as p:
    browser = p.chromium.launch(channel='chrome', headless=True, args=['--enable-unsafe-swiftshader'])
    page = browser.new_page(viewport={'width': 1280, 'height': 800}, color_scheme='dark')
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(args.url)
    guide = page.locator('.interface-tour')
    expect(guide).to_be_visible()
    assert page.locator('html').get_attribute('data-theme') == 'light'
    page.keyboard.press('h')
    expect(page.get_by_role('button', name='Launch mission', exact=True)).to_have_count(1)
    for width, height in [(1280, 800), (390, 844), (320, 700)]:
        page.set_viewport_size({'width': width, 'height': height})
        assert guide.evaluate('(e)=>e.scrollWidth<=e.clientWidth'), width
        assert guide.evaluate('(e)=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight}'), width
    page.set_viewport_size({'width': 1280, 'height': 800})
    def finish_walkthrough():
        for _ in range(4):
            page.get_by_role('button', name='Next', exact=True).click()
        page.get_by_role('button', name='Continue', exact=True).click()
    finish_walkthrough()
    page.get_by_role('button', name='Don’t view explanation', exact=True).click()
    expect(page.get_by_role('heading', name='Skip the explanation?')).to_be_visible()
    page.get_by_role('button', name='No, show explanation', exact=True).click()
    expect(page.locator('.ex-story-content')).to_be_visible()
    page.locator('.ex-progress-steps button').last.click()
    page.get_by_role('button', name='Explore your mission', exact=True).click()
    expect(page.get_by_role('heading', name='View our Observatory')).to_be_visible()
    page.get_by_role('button', name='View Observatory →', exact=True).click()
    expect(page.get_by_role('heading', name='Take the Observatory tour')).to_be_visible()
    page.get_by_role('button', name='Start Observatory tour', exact=True).click()
    expect(page.locator('.ob-tour-panel')).to_be_visible()
    page.goto(args.url)
    expect(guide).to_have_count(0)
    page.get_by_role('button', name='Layers', exact=True).click()
    assert all(not item.is_checked() for item in page.locator('.layer-menu input').all())
    page.get_by_role('button', name='Layers', exact=True).click()
    page.get_by_role('button', name='Switch to dark mode', exact=True).click()
    page.reload()
    assert page.locator('html').get_attribute('data-theme') == 'light'
    page.evaluate("localStorage.removeItem('swarm-welcome-v1')")
    page.reload()
    finish_walkthrough()
    page.get_by_role('button', name='Don’t view explanation', exact=True).click()
    page.get_by_role('button', name='Yes, skip and explore', exact=True).click()
    expect(guide).to_have_count(0)
    page.reload()
    expect(guide).to_have_count(0)
    page.get_by_role('button', name='Replay workspace tutorial', exact=True).click()
    expect(guide).to_be_visible()
    page.keyboard.press('Escape')
    page.get_by_role('button', name='Don’t view explanation', exact=True).click()
    page.get_by_role('button', name='Yes, skip and explore', exact=True).click()
    page.evaluate("localStorage.removeItem('swarm-welcome-v1')")
    page.reload()
    finish_walkthrough()
    page.get_by_role('button', name='View explanation', exact=True).click()
    expect(page.locator('.ex-story-content')).to_be_visible()
    assert not errors, errors
    browser.close()
    print('PASS: desktop/mobile, fresh light startup, layers off, first-visit persistence, both skip branches, direct explanation, keyboard isolation; no JS errors')
