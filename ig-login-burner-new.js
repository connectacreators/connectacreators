const puppeteer = require("puppeteer");
const fs = require("fs");

(async () => {
  const browser = await puppeteer.launch({
    headless: "new",
    args: [
      "--no-sandbox", "--disable-setuid-sandbox",
      "--disable-blink-features=AutomationControlled"
    ]
  });
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
  });
  await page.setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");

  console.log("[burner] Loading Instagram login via WARP...");
  await page.goto("https://www.instagram.com/accounts/login/", { waitUntil: "networkidle2", timeout: 30000 });

  await page.waitForSelector("input[name=username]", { timeout: 10000 }).catch(() => null);
  await new Promise(r => setTimeout(r, 1000));

  // Type username
  const usernameInput = await page.$("input[name=username]") || await page.$("input[name=email]");
  if (!usernameInput) {
    // Maybe we're already logged in — check for cookies
    const cookies = await page.cookies();
    const hasSession = cookies.some(c => c.name === "sessionid" && c.value);
    if (hasSession) {
      console.log("[burner] Already logged in! Saving cookies...");
      fs.writeFileSync("/var/www/ig-cookies-2.json", JSON.stringify(cookies, null, 2));
      console.log("[burner] Saved", cookies.length, "cookies to ig-cookies-2.json");
      await browser.close();
      return;
    }
    console.log("[burner] No username input found and no session. Screenshot saved.");
    await page.screenshot({ path: "/var/www/ig-burner-debug.png", fullPage: true });
    await browser.close();
    process.exit(1);
  }

  await usernameInput.click();
  await new Promise(r => setTimeout(r, 200));
  await usernameInput.type("connectabroski", { delay: 80 });

  await new Promise(r => setTimeout(r, 800));

  const passInput = await page.$("input[name=password]") || await page.$("input[name=pass]");
  await passInput.click();
  await new Promise(r => setTimeout(r, 200));
  await passInput.type("Rjg290802*", { delay: 80 });

  await new Promise(r => setTimeout(r, 1500));

  // Submit via Enter
  await page.keyboard.press("Enter");
  console.log("[burner] Submitted login...");

  await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 25000 }).catch(e => console.log("[burner] Nav:", e.message));
  await new Promise(r => setTimeout(r, 5000));

  const finalUrl = page.url();
  console.log("[burner] Final URL:", finalUrl);

  if (finalUrl.includes("challenge") || finalUrl.includes("two_factor")) {
    console.log("[burner] CHALLENGE/2FA detected — need manual intervention");
    await page.screenshot({ path: "/var/www/ig-burner-challenge.png", fullPage: true });
    await browser.close();
    process.exit(1);
  } else if (finalUrl.includes("/accounts/login")) {
    console.log("[burner] STILL ON LOGIN PAGE — credentials may be wrong");
    await page.screenshot({ path: "/var/www/ig-burner-debug.png", fullPage: true });
    await browser.close();
    process.exit(1);
  } else {
    console.log("[burner] LOGIN SUCCESS — saving cookies...");
    const cookies = await page.cookies();
    fs.writeFileSync("/var/www/ig-cookies-2.json", JSON.stringify(cookies, null, 2));
    console.log("[burner] Saved", cookies.length, "cookies to ig-cookies-2.json");

    // Also update yt-dlp Netscape format cookies
    try {
      const netscapeLines = ["# Netscape HTTP Cookie File"];
      for (const c of cookies) {
        if (c.domain.includes("instagram")) {
          const secure = c.secure ? "TRUE" : "FALSE";
          const httpOnly = c.httpOnly ? "TRUE" : "FALSE";
          const expiry = c.expires ? Math.floor(c.expires) : 0;
          netscapeLines.push([c.domain, httpOnly, c.path, secure, expiry, c.name, c.value].join("\t"));
        }
      }
      fs.writeFileSync("/root/instagram_cookies.txt", netscapeLines.join("\n") + "\n");
      console.log("[burner] Updated yt-dlp Netscape cookies");
    } catch (e) {
      console.log("[burner] Failed to update yt-dlp cookies:", e.message);
    }
  }

  await browser.close();
})().catch(e => { console.error("[burner] Error:", e.message); process.exit(1); });
