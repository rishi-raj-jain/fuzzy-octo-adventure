import fs from 'node:fs'
import path from 'node:path'
import puppeteer, { type Browser } from 'puppeteer-core'

const isServerless = () => Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME)

function findLocalChrome(): string | undefined {
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ]
  // Playwright-managed browsers (e.g. `npx playwright install chromium`).
  const pwRoot = process.env.PLAYWRIGHT_BROWSERS_PATH
  if (pwRoot && fs.existsSync(pwRoot)) {
    for (const dir of fs.readdirSync(pwRoot).filter((d) => /^chromium-\d+$/.test(d))) {
      candidates.unshift(path.join(pwRoot, dir, 'chrome-linux', 'chrome'), path.join(pwRoot, dir, 'chrome-linux64', 'chrome'))
    }
  }
  return candidates.find((p) => fs.existsSync(p))
}

/**
 * On Vercel/Lambda we use the brotli-packed Chromium from @sparticuz/chromium.
 * Locally we use CHROME_EXECUTABLE_PATH or the first Chrome/Chromium we can find.
 */
export async function launchBrowser(): Promise<Browser> {
  const executablePath = process.env.CHROME_EXECUTABLE_PATH
  if (isServerless() && !executablePath) {
    const chromium = (await import('@sparticuz/chromium')).default
    chromium.setGraphicsMode = false
    return puppeteer.launch({
      args: await puppeteer.defaultArgs({ args: chromium.args, headless: 'shell' }),
      executablePath: await chromium.executablePath(),
      headless: 'shell',
      defaultViewport: null,
    })
  }

  const localPath = executablePath || findLocalChrome()
  if (!localPath) {
    throw new Error('No Chrome/Chromium found. Set CHROME_EXECUTABLE_PATH to a local Chrome or Chromium binary.')
  }
  return puppeteer.launch({
    executablePath: localPath,
    headless: true,
    defaultViewport: null,
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--no-first-run',
      '--no-default-browser-check',
      '--hide-scrollbars',
      '--mute-audio',
      ...(process.env.CHROME_PROXY_SERVER ? [`--proxy-server=${process.env.CHROME_PROXY_SERVER}`] : []),
    ],
  })
}
