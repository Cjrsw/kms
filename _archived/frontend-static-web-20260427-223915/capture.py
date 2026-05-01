import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()
        await page.set_viewport_size({'width': 1920, 'height': 1080})
        await page.goto('https://pns.kurogames.com/#News', wait_until='networkidle')
        await page.wait_for_timeout(5000)
        await page.screenshot(path='screenshot.png', full_page=True)
        await browser.close()

asyncio.run(main())
