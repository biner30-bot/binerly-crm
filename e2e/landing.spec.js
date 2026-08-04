import { test, expect } from "@playwright/test";

// Herkese açık, veri yazmayan salt-okur akışlar. Girişli/veri oluşturan
// testler ayrı bir karar gerektiriyor çünkü ayrı bir test ortamı yok,
// üretim Supabase'ine karşı çalışırlardı.

test("landing page loads with expected title and hero heading", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Binerly/);
  await expect(page.getByRole("heading", { name: /ihtiyacınız olan her şey/i })).toBeVisible();
});

test("landing page nav links to login", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: /giriş/i }).first()).toBeVisible();
});
