import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function openCourse(page: Page): Promise<void> {
  await page.goto("/");
  await page.locator(".course-row").first().click();
  await expect(page.locator(".exam-card").first()).toBeVisible();
}

async function openFirstExam(page: Page, mode: "practice" | "exam"): Promise<void> {
  await openCourse(page);
  const card = page.locator(".exam-card").first();
  await card.locator(mode === "practice" ? ".primary" : ".secondary").click();
  await expect(page.locator(".choice").first()).toBeVisible();
}

test("home lists courses, search filters and course opens", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("h1")).toHaveText("مذاكرة");
  const courses = page.locator(".course-row");
  expect(await courses.count()).toBeGreaterThan(0);

  const first = (await courses.first().locator("strong").textContent()) ?? "";
  await page.locator('input[type="search"]').fill(first.slice(0, 4));
  await expect(page.locator(".course-row").first()).toBeVisible();
  const filtered = await page.locator(".course-row strong").allTextContents();
  expect(filtered.every((name) => name.includes(first.slice(0, 4)))).toBe(true);

  await page.locator('input[type="search"]').fill("");
  await courses.first().click();
  await expect(page.locator("h1")).not.toHaveText("مذاكرة");
  await expect(page.locator(".exam-card").first()).toBeVisible();
});

test("practice locks after one answer and survives reload", async ({ page }) => {
  await openFirstExam(page, "practice");
  const choices = page.locator(".choice");
  await choices.nth(0).click();
  await expect(page.locator(".feedback")).not.toBeEmpty();
  await expect(choices.nth(0)).toHaveAttribute("aria-pressed", "true");
  await expect(choices.nth(0)).toHaveClass(/locked/);

  await choices.nth(1).click({ force: true });
  await expect(choices.nth(0)).toHaveAttribute("aria-pressed", "true");
  await expect(choices.nth(1)).toHaveAttribute("aria-pressed", "false");

  await page.reload();
  await expect(page.locator(".choice").first()).toBeVisible();
  await expect(page.locator(".choice").nth(0)).toHaveAttribute("aria-pressed", "true");
});

test("exam mode hides correctness until submission", async ({ page }) => {
  await openFirstExam(page, "exam");
  await page.locator(".choice").first().click();
  await expect(page.locator(".choice").first()).toHaveClass(/selected/);
  await expect(page.locator(".choice.correct")).toHaveCount(0);
  await expect(page.locator(".choice.wrong")).toHaveCount(0);

  await page.getByRole("button", { name: "تسليم" }).first().click();
  await expect(page.locator("dialog")).toBeVisible();
  await page.locator("dialog .primary").click();
  await expect(page.locator("h1")).toHaveText("النتيجة");
  await expect(page.locator(".score-main strong")).toContainText("%");
});

test("download then work offline; undownloaded exam fails clearly", async ({
  page,
  context,
}) => {
  await openCourse(page);
  const card = page.locator(".exam-card").first();
  const examId = (await card.getAttribute("data-exam-id")) ?? "";
  expect(examId).not.toBe("");

  await card.getByRole("button", { name: "تنزيل الامتحان" }).click();
  await expect(card.locator(".pill-complete")).toBeVisible();

  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise<void>((resolve) => {
        navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), {
          once: true,
        });
      });
    }
  });

  const otherId = await page.evaluate(async (downloaded) => {
    const manifest = await (await fetch("./data/manifest.json")).json();
    const ids: string[] = manifest.courses.flatMap(
      (course: { exams: { examId: string }[] }) =>
        course.exams.map((exam) => exam.examId),
    );
    return ids.find((id) => id !== downloaded) ?? "";
  }, examId);
  expect(otherId).not.toBe("");

  await context.setOffline(true);
  await page.reload();
  await expect(page.locator("h1").first()).toBeVisible();
  await page.goto(`/#/quiz/${examId}/practice`);
  await expect(page.locator(".choice").first()).toBeVisible();

  await page.goto(`/#/quiz/${otherId}/practice`);
  await expect(page.locator(".notice-bad")).toBeVisible();
  await context.setOffline(false);
});

test("home and quiz have no axe violations", async ({ page }) => {
  await page.goto("/");
  const home = await new AxeBuilder({ page }).analyze();
  expect(home.violations).toEqual([]);

  await openFirstExam(page, "practice");
  await page.locator(".choice").first().click();
  const quiz = await new AxeBuilder({ page }).analyze();
  expect(quiz.violations).toEqual([]);
});
