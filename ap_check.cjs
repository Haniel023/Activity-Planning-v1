const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe" });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1300, height: 800 });

  // First add one approver per role via the settings tab
  await page.goto("http://localhost:5173", { waitUntil: "networkidle" });
  await page.click("button:has-text('Settings')");
  await page.waitForTimeout(400);

  // Add Project Leader
  await page.fill("input[placeholder='e.g. Juan dela Cruz']", "Jonathan Medalla");
  await page.fill("input[placeholder='e.g. juan@company.com']", "jonathan@company.com");
  await page.selectOption("select", "PROJECT LEADER");
  await page.click("button:has-text('+ Add Approver')");
  await page.waitForTimeout(400);

  // Add Supervisor
  await page.fill("input[placeholder='e.g. Juan dela Cruz']", "Maria Santos");
  await page.fill("input[placeholder='e.g. juan@company.com']", "maria@company.com");
  await page.selectOption("select", "SUPERVISOR");
  await page.click("button:has-text('+ Add Approver')");
  await page.waitForTimeout(400);

  // Add Manager
  await page.fill("input[placeholder='e.g. Juan dela Cruz']", "Roberto Cruz");
  await page.fill("input[placeholder='e.g. juan@company.com']", "roberto@company.com");
  await page.selectOption("select", "MANAGER");
  await page.click("button:has-text('+ Add Approver')");
  await page.waitForTimeout(600);

  // Open the draft plan
  await page.click("button:has-text('Plans')");
  await page.waitForTimeout(400);
  const openBtns = await page.locator("button:has-text('Open')").all();
  await openBtns[0].click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "C:/Temp/ap_approval_filtered.png" });
  await browser.close();
})();
