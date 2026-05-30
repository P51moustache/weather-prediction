import { test, expect } from "@playwright/test";

test.describe("Dashboard", () => {
  test("loads the dashboard page", async ({ page }) => {
    await page.goto("/");

    // Check title
    await expect(page.locator("h1")).toContainText("Weather Edge Dashboard");
  });

  test("displays summary cards", async ({ page }) => {
    await page.goto("/");

    // Wait for data to load
    await page.waitForSelector("text=Total Markets");

    // Check summary cards exist
    await expect(page.locator("text=Total Markets")).toBeVisible();
    await expect(page.locator("text=Opportunities")).toBeVisible();
    await expect(page.locator("text=Avg Edge")).toBeVisible();
    await expect(page.getByText("Signals", { exact: true })).toBeVisible();
  });

  test("displays health status", async ({ page }) => {
    await page.goto("/");

    // Wait for health check
    await page.waitForSelector("text=System Health");

    // Check health card
    await expect(page.locator("text=System Health")).toBeVisible();
    await expect(page.locator("text=Database")).toBeVisible();
  });

  test("displays edge table", async ({ page }) => {
    await page.goto("/");

    // Wait for edge table
    await page.waitForSelector("text=Edge Detection");

    // Check table headers
    await expect(page.locator("text=Edge Detection")).toBeVisible();
    await expect(page.locator("th:text('Date')")).toBeVisible();
    await expect(page.locator("th:text('Bracket')")).toBeVisible();
    await expect(page.locator("th:text('Model')")).toBeVisible();
    await expect(page.locator("th:text('Market')")).toBeVisible();
    await expect(page.locator("th:text('Edge')")).toBeVisible();
  });

  test("sync button works", async ({ page }) => {
    await page.goto("/");

    // Click sync button
    const syncButton = page.locator("button:text('Sync Data')");
    await expect(syncButton).toBeVisible();

    await syncButton.click();

    // Button should show syncing state
    await expect(page.locator("button:text('Syncing...')")).toBeVisible();

    // Wait for sync to complete
    await expect(page.locator("button:text('Sync Data')")).toBeVisible({
      timeout: 10000,
    });

    // Last sync time should appear
    await expect(page.locator("text=Last sync:")).toBeVisible();
  });

  test("displays forecast card", async ({ page }) => {
    await page.goto("/");

    // Wait for forecast
    await page.waitForSelector("text=LA Forecast");

    // Check forecast info
    await expect(page.locator("text=LA Forecast")).toBeVisible();
    // Check that the point forecast with temperature is visible (e.g., "69°F")
    await expect(page.locator(".text-4xl")).toBeVisible();
  });
});

test.describe("API", () => {
  test("health endpoint returns status", async ({ request }) => {
    const response = await request.get("/api/health");

    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data.status).toBeDefined();
    expect(data.checks).toBeDefined();
    expect(data.checks.database).toBeDefined();
  });

  test("edges endpoint returns data", async ({ request }) => {
    const response = await request.get("/api/edges");

    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.edges).toBeDefined();
    expect(Array.isArray(data.edges)).toBe(true);
  });

  test("sync endpoint processes data", async ({ request }) => {
    const response = await request.post("/api/sync");

    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.stats).toBeDefined();
    expect(data.stats.markets).toBeGreaterThan(0);
  });
});
