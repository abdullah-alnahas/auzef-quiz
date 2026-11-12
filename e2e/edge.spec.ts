import AxeBuilder from "@axe-core/playwright";
import { readFileSync, writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

async function openCourse(page: Page): Promise<void> {
  await page.goto("/");
  await page.locator(".course-row").first().click();
  await expect(page.locator(".exam-card").first()).toBeVisible();
}

test("Turkish UI switches direction and strings", async ({ page }) => {
  await page.goto("/");
  await page.locator(".app-header button").click();
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await expect(page.locator("html")).toHaveAttribute("lang", "tr");
  await expect(page.locator("h1")).toHaveText("Müzakere");
  await page.locator(".app-header button").click();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
});

test("bookmark persists across reload and filters results", async ({ page }) => {
  await openCourse(page);
  await page.locator(".exam-card").first().locator(".secondary").click();
  await expect(page.locator(".choice").first()).toBeVisible();

  const bookmark = page.getByRole("button", { name: "حفظ السؤال" });
  await bookmark.click();
  await expect(page.getByRole("button", { name: "إزالة الحفظ" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await page.reload();
  await expect(page.getByRole("button", { name: "إزالة الحفظ" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await page.locator(".choice").first().click();
  await page.getByRole("button", { name: "تسليم" }).first().click();
  await page.locator("dialog .primary").click();
  await expect(page.locator("h1")).toHaveText("النتيجة");
  await page.getByRole("button", { name: "المحفوظة" }).click();
  await expect(page.locator(".review-item")).toHaveCount(1);
});

test("four-choice and long questions render without overflow", async ({ page }) => {
  await page.goto("/");
  const target = await page.evaluate(async () => {
    const manifest = await (await fetch("./data/manifest.json")).json();
    for (const course of manifest.courses.slice(0, 4)) {
      for (const exam of course.exams) {
        const data = await (await fetch(`./data/exams/${exam.examId}.json`)).json();
        const four = data.questions.some(
          (q: { choices: unknown[] }) => q.choices.length === 4,
        );
        const long = data.questions.some(
          (q: { turkish: { text: string } }) => q.turkish.text.length > 180,
        );
        if (four && long) return exam.examId as string;
      }
    }
    return "";
  });
  expect(target).not.toBe("");

  await page.goto(`/#/quiz/${target}/practice`);
  await expect(page.locator(".choice").first()).toBeVisible();
  const counts = await page.evaluate(async (examId) => {
    const data = await (await fetch(`./data/exams/${examId}.json`)).json();
    return data.questions.map((q: { choices: unknown[] }) => q.choices.length);
  }, target);
  expect(counts).toContain(4);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test.describe("download failures", () => {
  test.use({ serviceWorkers: "block" });

  test("a failed download reports and can be retried", async ({ page }) => {
  await openCourse(page);
  const card = page.locator(".exam-card").first();
  await page.route("**/data/exams/*.json", (route) => route.abort());
  await card.getByRole("button", { name: "تنزيل الامتحان" }).click();
  await expect(page.locator(".notice-bad")).toBeVisible();

    await page.unroute("**/data/exams/*.json");
    await card.getByRole("button", { name: "تنزيل الامتحان" }).click();
    await expect(card.locator(".pill-complete")).toBeVisible();
  });

  test("a bulk download keeps reporting an earlier failure", async ({ page }) => {
    await openCourse(page);
    let failed = false;
    await page.route("**/data/exams/*.json", async (route) => {
      if (!failed) {
        failed = true;
        await route.abort();
        return;
      }
      await route.continue();
    });

    const cards = page.locator(".exam-card");
    const total = await cards.count();
    expect(total).toBeGreaterThan(1);

    await page.getByRole("button", { name: "تنزيل المقرر" }).click();
    await expect(page.locator(".exam-card .pill-complete")).toHaveCount(total - 1, {
      timeout: 20_000,
    });
    await expect(page.locator(".notice-bad")).toBeVisible();
  });
});

test("home still loads when IndexedDB is unavailable", async ({ page }) => {
  await page.addInitScript(() => {
    IDBFactory.prototype.open = () => {
      throw new Error("indexedDB blocked");
    };
  });

  await page.goto("/");
  await expect(page.locator("h1")).toHaveText("مذاكرة");
  await expect(page.locator(".course-row").first()).toBeVisible();
  await expect(page.locator(".banner-bad")).toContainText("تعذّر حفظ التقدّم");
});

test("results screen has no axe violations", async ({ page }) => {
  await openCourse(page);
  await page.locator(".exam-card").first().locator(".secondary").click();
  await expect(page.locator(".choice").first()).toBeVisible();
  await page.locator(".choice").first().click();
  await page.getByRole("button", { name: "تسليم" }).first().click();
  await page.locator("dialog .primary").click();
  await expect(page.locator("h1")).toHaveText("النتيجة");
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test("app update keeps saved progress", async ({ page }) => {
  await openCourse(page);
  await page.locator(".exam-card").first().locator(".primary").click();
  await expect(page.locator(".choice").first()).toBeVisible();
  await page.locator(".choice").first().click();
  await expect(page.locator(".choice").first()).toHaveAttribute("aria-pressed", "true");

  const path = "dist/sw.js";
  const original = readFileSync(path, "utf8");
  writeFileSync(
    path,
    original.replace(/const VERSION = "[^"]+";/, 'const VERSION = "test-update";'),
  );
  try {
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      await registration?.update();
    });
    await expect(page.locator(".banner")).toContainText("نسخة جديدة جاهزة", {
      timeout: 15_000,
    });
    await page.getByRole("button", { name: "تحديث الآن" }).click();
    await expect(page.locator(".choice").first()).toBeVisible();
    await expect(page.locator(".choice").first()).toHaveAttribute("aria-pressed", "true");
  } finally {
    writeFileSync(path, original);
  }
});

test("initial JavaScript and LCP stay within budget", async ({ page }) => {
  await page.goto("/", { waitUntil: "load" });
  const lcp = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        new PerformanceObserver((list) => {
          const entries = list.getEntries();
          resolve(entries[entries.length - 1]?.startTime ?? -1);
        }).observe({ type: "largest-contentful-paint", buffered: true });
        setTimeout(() => resolve(-1), 1500);
      }),
  );
  expect(lcp).toBeGreaterThan(0);
  expect(lcp).toBeLessThan(2500);

  const jsBytes = await page.evaluate(() =>
    performance
      .getEntriesByType("resource")
      .filter((entry) => entry.name.endsWith(".js"))
      .reduce((sum, entry) => sum + ((entry as PerformanceResourceTiming).transferSize || 0), 0),
  );
  expect(jsBytes).toBeLessThan(60 * 1024);
});

test.describe("desktop", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("layout has no horizontal overflow and the quiz is usable", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".course-row").first()).toBeVisible();
    const homeOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(homeOverflow).toBeLessThanOrEqual(1);

    await page.locator(".course-row").first().click();
    await page.locator(".exam-card").first().locator(".primary").click();
    await expect(page.locator(".choice").first()).toBeVisible();
    const quizOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(quizOverflow).toBeLessThanOrEqual(1);
    const width = await page.locator(".choice").first().evaluate((el) => el.getBoundingClientRect().width);
    expect(width).toBeGreaterThan(300);
  });
});
