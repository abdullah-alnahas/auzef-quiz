import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function openCourse(page: Page): Promise<void> {
  await page.goto("/");
  await page.locator(".course-row").first().click();
  await expect(page.locator(".exam-card").first()).toBeVisible();
}

async function openFirstExam(page: Page, mode: "practice" | "exam"): Promise<string> {
  await openCourse(page);
  const card = page.locator(".exam-card").first();
  const examId = (await card.getAttribute("data-exam-id")) ?? "";
  await card.locator(mode === "practice" ? ".primary" : ".secondary").click();
  await expect(page.locator(".choice").first()).toBeVisible();
  return examId;
}

test("practice navigator colours correct, wrong and unanswered", async ({ page }) => {
  const examId = await openFirstExam(page, "practice");
  const data = await page.evaluate(async (id) => {
    const response = await fetch(`./data/exams/${id}.json`);
    return response.json();
  }, examId);
  const answers: (string | null)[] = data.questions.map(
    (q: { answer: string | null }) => q.answer,
  );
  const total = answers.length;

  const correctIndex = answers[0]!.charCodeAt(0) - 65;
  await page.locator(".choice").nth(correctIndex).click();
  await page.locator(".quiz-actions .primary").click();

  const secondLetters = await page
    .locator(".choice .choice-letter")
    .allTextContents();
  const wrongIndex = secondLetters.findIndex((letter) => letter !== answers[1]);
  await page.locator(".choice").nth(wrongIndex).click();

  await page.getByRole("button", { name: "خريطة الأسئلة" }).click();
  await expect(page.locator(".nav-cell.status-correct")).toHaveCount(1);
  await expect(page.locator(".nav-cell.status-wrong")).toHaveCount(1);
  await expect(page.locator(".nav-cell.status-unanswered")).toHaveCount(total - 2);
  await expect(page.locator(".nav-legend")).toContainText("صحيح");
  await expect(page.locator(".nav-legend")).toContainText("خطأ");
  await expect(page.locator(".nav-legend")).toContainText("بلا إجابة");

  const navigator = await new AxeBuilder({ page }).analyze();
  expect(navigator.violations).toEqual([]);
});

test("results show every choice with chosen and correct marks", async ({ page }) => {
  await openFirstExam(page, "exam");
  await page.locator(".choice").first().click();
  await page.getByRole("button", { name: "تسليم" }).first().click();
  await page.locator("dialog .primary").click();
  await expect(page.locator("h1")).toHaveText("النتيجة");

  expect(await page.locator(".review-choice").count()).toBeGreaterThan(0);
  expect(await page.locator(".review-choice.correct").count()).toBeGreaterThan(0);
  expect(await page.locator(".review-choice.chosen").count()).toBeGreaterThan(0);
  await expect(page.locator(".review-choice .review-tag").first()).toBeVisible();
});

test("course-level scope toggles combine the selected groups", async ({ page }) => {
  await openCourse(page);
  const expected = await page.evaluate(async () => {
    const manifest = await (await fetch("./data/manifest.json")).json();
    const course = manifest.courses[0];
    const count = (types: string[], mock: boolean) =>
      course.exams.filter(
        (exam: { type: string; mock: boolean }) =>
          types.includes(exam.type) && exam.mock === mock,
      );
    const vize = count(["vize"], false);
    const vizeDeneme = count(["vize"], true);
    return {
      vizeExams: vize.length,
      combinedExams: vize.length + vizeDeneme.length,
    };
  });
  expect(expected.vizeExams).toBeGreaterThan(1);

  // Default scope is vize + final; turn final off, leaving vize only.
  await page
    .locator(".test-all")
    .getByRole("button", { name: "النهائي + التكميلي", exact: true })
    .click();
  await expect(page.locator(".test-all")).toContainText(`${expected.vizeExams}`);
  await expect(page.locator(".combined-list li")).toHaveCount(expected.vizeExams);

  // Add the vize deneme group: the set must grow by the deneme exams.
  await page
    .locator(".test-all")
    .getByRole("button", { name: "النصفي التجريبي", exact: true })
    .click();
  await expect(page.locator(".combined-list li")).toHaveCount(expected.combinedExams);
  await page.locator(".test-all").getByRole("button", { name: "تدريب", exact: true }).click();

  await expect(page.locator("h1")).toHaveText("النصفي + النصفي التجريبي");
  await expect(page.locator(".combined-source li")).toHaveCount(expected.combinedExams);
  await expect(page.locator("p.muted.small").first()).toContainText("من");
  await expect(page.locator(".choice").first()).toBeVisible();
  await page.locator(".choice").first().click();
  await expect(page.locator(".choice").first()).toHaveAttribute("aria-pressed", "true");
  await page.waitForTimeout(500);
  await expect(page.locator(".choice").first()).toHaveAttribute("aria-pressed", "true");
  expect(page.url()).toContain("/combined/");
});
