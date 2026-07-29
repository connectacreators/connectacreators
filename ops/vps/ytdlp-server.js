// ─── Instagram: Puppeteer web_profile_info API ───
// ── Facebook profile scraper (Puppeteer-enumerate + yt-dlp per reel) ─────────
// FB pages can't be scraped via yt-dlp playlist or plain HTTP (JS-only shell).
// A real headless browser with a logged-in session (/var/www/fb-cookies.txt)
// DOES render the /<page>/reels tab, so we enumerate reel IDs from the DOM,
// then scrape each reel's metrics via yt-dlp (public reel URLs need no cookies).
// Same pattern as IG/TikTok: enumerate → per-item metrics. No OAuth needed.
const FB_COOKIES = "/var/www/fb-cookies.txt";

function fbCleanUsername(raw) {
  return String(raw || "")
    .replace(/^@/, "")
    .replace(/.*facebook\.com\//i, "")
    .replace(/\?.*$/, "")
    .replace(/\/.*$/, "")
    .trim();
}

function fbParseCookies() {
  const fs = require("fs");
  const out = [];
  try {
    for (const line of fs.readFileSync(FB_COOKIES, "utf8").split("\n")) {
      if (!line || line.startsWith("#")) continue;
      const p = line.split("\t");
      if (p.length !== 7) continue;
      const [domain, , path, secure, expires, name, value] = p;
      if (!/facebook\.com/.test(domain)) continue;
      out.push({ name, value, domain: domain.replace(/^\./, ""), path: path || "/", secure: secure === "TRUE", expires: Number(expires) || undefined });
    }
  } catch { /* no cookies */ }
  return out;
}

// One video's metrics via yt-dlp (-J). Public FB videos need no cookies. A reel
// ID resolves at /reel/<id>; a regular video at /watch/?v=<id> — try reel first
// (most creator content), fall back to watch so the /videos-tab items resolve too.
function fbScrapeReel(id) {
  const { execFile } = require("child_process");
  const tryUrl = (url) => new Promise((resolve) => {
    execFile("yt-dlp", ["-J", "--no-warnings", "--no-check-certificates", "--socket-timeout", "12", url],
      { timeout: 20000, maxBuffer: 40 * 1024 * 1024 }, (err, stdout) => {
        if (err || !stdout) return resolve(null);
        try {
          const m = JSON.parse(stdout);
          let posted = null;
          if (typeof m.timestamp === "number") posted = new Date(m.timestamp * 1000).toISOString().slice(0, 10);
          else if (m.upload_date && m.upload_date.length === 8) posted = `${m.upload_date.slice(0,4)}-${m.upload_date.slice(4,6)}-${m.upload_date.slice(6,8)}`;
          const thumb = m.thumbnail || (Array.isArray(m.thumbnails) && m.thumbnails.length ? m.thumbnails[m.thumbnails.length - 1].url : null);
          resolve({
            id,
            title: String(m.description || m.title || "").slice(0, 600),
            views: Number(m.view_count || 0) || 0,
            likes: Number(m.like_count || 0) || 0,
            comments: Number(m.comment_count || 0) || 0,
            thumbnail: thumb,
            posted_at: posted,
            url,
          });
        } catch { resolve(null); }
      });
  });
  return tryUrl(`https://www.facebook.com/reel/${id}`).then((r) => r || tryUrl(`https://www.facebook.com/watch/?v=${id}`));
}

// Parse a localized short count ("1.2K", "3,4 mil", "1,234", 12345) → integer.
function fbParseCount(s) {
  if (s == null) return null;
  if (typeof s === "number") return Math.round(s);
  let t = String(s).trim().toUpperCase().replace(/\s+/g, "");
  const mult = /K|MIL/.test(t) ? 1e3 : /M(?!IL)|MILLON|MILLÓN/.test(t) ? 1e6 : /B/.test(t) ? 1e9 : 1;
  t = t.replace(/[^0-9.,]/g, "");
  if (t.includes(",") && t.includes(".")) t = t.replace(/,/g, "");        // "1,234.5" thousands
  else if (t.includes(",")) t = mult > 1 ? t.replace(",", ".") : t.replace(/,/g, ""); // "1,2K"→1.2 | "1,234"→1234
  const n = parseFloat(t);
  if (isNaN(n)) return null;
  return Math.round(n * mult);
}

// Full metrics for ONE reel by loading its page in the (warm, logged-in) browser.
// yt-dlp returns 0 for FB likes/comments, but the reel page's embedded JSON has
// reaction/comment counts. Locale-independent JSON keys first, og:* as fallback,
// then yt-dlp as a last resort for views. Images/media/css blocked for speed.
async function fbScrapeReelBrowser(browser, id, debug) {
  const url = `https://www.facebook.com/reel/${id}`;
  let page = null, data = null;
  try {
    page = await browser.newPage();
    await page.setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36");
    await page.setRequestInterception(true);
    page.on("request", (r) => {
      const t = r.resourceType();
      if (t === "image" || t === "media" || t === "font" || t === "stylesheet") r.abort().catch(() => {});
      else r.continue().catch(() => {});
    });
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 2500));
    data = await page.evaluate(() => {
      const html = document.documentElement.innerHTML;
      const first = (res) => { for (const re of res) { const m = html.match(re); if (m && m[1] != null) return m[1]; } return null; };
      const metaC = (sel) => { const el = document.querySelector(sel); return el ? el.getAttribute("content") : null; };
      return {
        viewsRaw: first([/"video_view_count":(\d+)/, /"play_count":(\d+)/, /"video_play_count":(\d+)/, /"video_post_view_count":(\d+)/, /"post_view_count":(\d+)/]),
        reactRaw: first([/"reaction_count":\{"count":(\d+)/, /"i18n_reaction_count":"([^"]+)"/, /"unified_reactors":\{"count":(\d+)/, /"reaction_count":(\d+)/]),
        commentRaw: first([/"total_comment_count":(\d+)/, /"comment_count":\{"total_count":(\d+)\}/, /"i18n_comment_count":"([^"]+)"/, /"comment_rendering_instance"[\s\S]{0,600}?"total_count":(\d+)/]),
        tsRaw: first([/"publish_time":(\d{10})/, /"creation_time":(\d{10})/, /"created_time":(\d{10})/]),
        ogImage: metaC('meta[property="og:image"]'),
        ogDesc: metaC('meta[property="og:description"]'),
      };
    });
    if (debug) console.log(`[scrape-fb] reel ${id} extract:`, JSON.stringify(data).slice(0, 400));
  } catch (e) {
    if (debug) console.log(`[scrape-fb] reel ${id} browser err:`, (e.message || "").slice(0, 120));
  } finally {
    if (page) await page.close().catch(() => {});
  }

  let views = fbParseCount(data && data.viewsRaw) || 0;
  let likes = fbParseCount(data && data.reactRaw) || 0;
  let comments = fbParseCount(data && data.commentRaw) || 0;
  let title = ((data && data.ogDesc) || "").slice(0, 600);
  let thumbnail = (data && data.ogImage) || null;
  let posted = (data && data.tsRaw) ? new Date(Number(data.tsRaw) * 1000).toISOString().slice(0, 10) : null;

  // Fallback: recover views/caption/thumb/date via yt-dlp if the browser missed
  // them (reactions/comments can't come from yt-dlp, so those stay browser-only).
  if (views === 0 || !thumbnail || !title) {
    const yd = await fbScrapeReel(id);
    if (yd) {
      if (views === 0) views = yd.views || 0;
      if (!title) title = yd.title || "";
      if (!thumbnail) thumbnail = yd.thumbnail || null;
      if (!posted) posted = yd.posted_at || null;
    }
  }

  if (views === 0 && likes === 0 && comments === 0 && !thumbnail) return null;
  return {
    id, title, views, likes, comments,
    engagement_rate: views > 0 ? +(((likes + comments) / views) * 100).toFixed(2) : 0,
    thumbnail, posted_at: posted, url,
  };
}

async function scrapeFacebookProfile(username, limit = 20) {
  const user = fbCleanUsername(username);
  const empty = { posts: [], username: user, platform: "facebook", profilePicUrl: null, followers: null, totalPosts: 0 };
  if (!user) return empty;

  // 1. Enumerate video/reel IDs with a real browser (logged-in session).
  //    FB VIRTUALIZES these grids — cards scrolled past are removed from the
  //    DOM — so IDs are accumulated AFTER EVERY scroll into a Set, not read once
  //    at the end (that only caught the last ~10 rendered). Both the /reels and
  //    /videos tabs are enumerated: pages that post regular videos (not reels)
  //    only appear under /videos, whose links look like /videos/<slug>/<id>/.
  let browser, videoIds = [], followers = null;
  try {
    const puppeteer = require("puppeteer");
    browser = await puppeteer.launch({
      headless: "new",
      protocolTimeout: 90000,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--proxy-server=socks5://127.0.0.1:1080", "--disable-blink-features=AutomationControlled"],
    });
    const page = await browser.newPage();
    await page.evaluateOnNewDocument(() => Object.defineProperty(navigator, "webdriver", { get: () => false }));
    await page.setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36");
    const cookies = fbParseCookies();
    if (cookies.length) await page.setCookie(...cookies);

    const seen = new Set();
    const enumTab = async (tabUrl) => {
      await page.goto(tabUrl, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
      await page.waitForSelector('a[href*="/reel/"],a[href*="/videos/"],a[href*="/watch"]', { timeout: 20000 }).catch(() => {});
      await new Promise((r) => setTimeout(r, 2000));
      const maxScrolls = Math.min(40, Math.ceil(limit / 2) + 8);
      let stagnant = 0;
      for (let i = 0; i < maxScrolls; i++) {
        const before = seen.size;
        const got = await page.evaluate(() => {
          const hrefs = Array.from(document.querySelectorAll('a[href*="/reel/"],a[href*="/videos/"],a[href*="/watch"]'))
            .map((a) => a.getAttribute("href")).filter(Boolean);
          const out = [];
          for (const h of hrefs) {
            const m = h.match(/\/reel\/(\d+)/) || h.match(/\/videos\/(?:[^/]+\/)?(\d+)/) || h.match(/[?&]v=(\d+)/);
            if (m) out.push(m[1]);
          }
          const fm = (document.body?.innerText || "").match(/([\d.,]+[KM]?)\s*(?:followers|seguidores)/i);
          return { out, followers: fm ? fm[1] : null };
        });
        for (const id of got.out) seen.add(id);
        if (got.followers && !followers) {
          let n = parseFloat(got.followers.replace(/,/g, ""));
          if (/K/i.test(got.followers)) n *= 1e3; else if (/M/i.test(got.followers)) n *= 1e6;
          followers = Math.round(n);
        }
        if (seen.size >= limit) break;
        await page.evaluate(() => window.scrollBy(0, window.innerHeight * 2));
        await new Promise((r) => setTimeout(r, 1400));
        if (seen.size === before) { if (++stagnant >= 3) break; } else stagnant = 0;
      }
    };
    await enumTab(`https://www.facebook.com/${user}/reels`);
    if (seen.size < limit) await enumTab(`https://www.facebook.com/${user}/videos`);
    videoIds = [...seen];
  } catch (e) {
    console.warn("[scrape-fb] enumerate failed:", e.message);
  }

  try {
    if (videoIds.length === 0) {
      console.warn(`[scrape-fb] @${user}: 0 videos enumerated`);
      return { ...empty, followers };
    }

    // 2. Full metrics per video from its page in the same warm browser
    //    (reactions + comments live in the logged-in page's embedded JSON;
    //    yt-dlp returns 0 for those on Facebook).
    const ids = videoIds.slice(0, limit);
    const posts = [];
    const CONC = 4;
    for (let i = 0; i < ids.length; i += CONC) {
      const batch = await Promise.all(
        ids.slice(i, i + CONC).map((id, j) => fbScrapeReelBrowser(browser, id, i === 0 && j === 0))
      );
      for (const p of batch) if (p) posts.push(p);
    }
    console.log(`[scrape-fb] @${user}: ${posts.length}/${ids.length} videos scraped, followers=${followers}`);
    return { posts, username: user, platform: "facebook", profilePicUrl: null, followers, totalPosts: posts.length };
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

async function scrapeInstagramProfile(username, limit) {
  const { execFileSync } = require("child_process");
  
  // Strip URL to username
  const igUrlMatch = username.match(/instagram\.com\/([A-Za-z0-9_.]+)/);
  if (igUrlMatch) username = igUrlMatch[1];
  username = username.replace(/^@/, "").replace(/\/$/, "");
  console.log("Scraping Instagram profile:", username, "limit:", limit);

  // Safety cap: max 150 posts per request to avoid triggering anti-automation
  const safeLim = Math.min(limit, 150);
  if (limit > 150) console.log("Capping limit from", limit, "to 150 for safety");

  // Load session cookies (with account rotation)
  const igAccount = getNextIgCookies();
  if (!igAccount) {
    console.log("No IG cookie files available — cannot scrape Instagram");
    return [];
  }
  let { cookieHeader, csrfToken } = igAccount;
  let igCookieFile = igAccount.file;

  // Helper: fetch IG API via curl + WARP proxy
  // IG API fetch. Primary egress is the WARP SOCKS proxy; if WARP's exit IP is
  // rate-limited ("Please wait a few minutes"), retry the same request straight
  // from the VPS IP. Verified 2026-07-29: WARP exit 104.28.205.117 answered
  // every request with the throttle message while the VPS IP returned full
  // results using the identical cookies, so a throttled WARP alone was zeroing
  // every Instagram scrape. Falls back per-request and self-heals when WARP
  // recovers; a genuine auth error still marks the account stale on first sight.
  function igApiFetch(apiUrl, method, postData, cookieOverride) {
    function buildArgs(useProxy) {
      const args = ["-s", "--max-time", "20"];
      if (useProxy) args.push("--socks5-hostname", "127.0.0.1:1080");
      args.push(
        "-H", "User-Agent: Instagram 344.0.0.0.98 Android (33/13; 420dpi; 1080x2340; samsung; SM-G991B; o1s; exynos2100)",
        "-H", "X-IG-App-ID: 936619743392459",
        "-H", "X-CSRFToken: " + csrfToken,
        "-H", "Cookie: " + (cookieOverride || cookieHeader)
      );
      if (method === "POST") {
        args.push("-X", "POST");
        args.push("-H", "Content-Type: application/x-www-form-urlencoded");
        if (postData) args.push("-d", postData);
      }
      args.push(apiUrl);
      return args;
    }

    let throttledAnywhere = false;
    for (const useProxy of [true, false]) {
      const via = useProxy ? "WARP" : "direct";
      let parsed;
      try {
        const result = execFileSync("curl", buildArgs(useProxy), { maxBuffer: 10 * 1024 * 1024, timeout: 25000 });
        parsed = JSON.parse(result.toString());
      } catch (e) {
        console.error("igApiFetch error (" + via + "):", e.message?.slice(0, 200));
        continue;
      }
      if (isIgAuthFailure(parsed)) {
        // IG's rate-limit reply carries require_login:true too. A transient
        // "Please wait a few minutes" must NOT mark the account stale — doing
        // so dropped both live accounts from rotation and returned "0 videos".
        if (/please wait a few minutes/i.test(parsed.message || "")) {
          throttledAnywhere = true;
          console.warn("[ig] Rate-limited via " + via + " (transient, not stale):", igCookieFile?.split("/").pop());
          continue;
        }
        console.warn("[ig] Auth error:", parsed.message, "on", igCookieFile?.split("/").pop());
        if (typeof markIgAccountStale === "function" && igCookieFile) markIgAccountStale(igCookieFile);
        return null;
      }
      if (!useProxy) console.log("[ig] Served via direct VPS IP (WARP throttled)");
      return parsed;
    }
    if (throttledAnywhere) console.warn("[ig] Rate-limited on BOTH WARP and direct egress");
    return null;
  }

  const results = [];

  try {
    // Step 1: Resolve username to user ID
    // IG throttles web_profile_info per acting account (ds_user_id). Strip it
    // for resolution only; clips/user below keeps the full authenticated jar.
    console.log("Resolving user ID for:", username);
    // Retry across the account rotation — a single stale/rate-limited account
    // otherwise turned a brand-new channel's first scrape into a silent
    // "0 videos" result (the auto-retry then landed on a healthy account,
    // which is why re-scraping always "fixed" it).
    let profileData = null;
    const resolveTries = Math.max(2, (typeof IG_COOKIE_FILES !== "undefined" && IG_COOKIE_FILES.length) || 2);
    for (let attempt = 0; attempt < resolveTries; attempt++) {
      if (attempt > 0) {
        // Wait out IG's burst-throttle window ("Please wait a few minutes"
        // clears in seconds when the burst stops) — an instant retry fails
        // inside the same window regardless of account.
        await new Promise((r) => setTimeout(r, 10000));
        const alt = getNextIgCookies();
        if (!alt) break;
        cookieHeader = alt.cookieHeader; csrfToken = alt.csrfToken; igCookieFile = alt.file;
        console.log("Resolve retry", attempt, "with", (alt.file || "").split("/").pop());
      }
      profileData = igApiFetch(
        "https://i.instagram.com/api/v1/users/" + username + "/usernameinfo/",
        "GET",
        null,
        stripDsUserId(cookieHeader)
      );
      if (profileData?.user?.pk) break;
    }

    if (!profileData?.user?.pk) {
      console.error("Could not resolve user ID for:", username, "after", resolveTries, "accounts");
      return results;
    }

    const userId = profileData.user.pk;
    console.log("User ID:", userId, "Followers:", profileData.user.follower_count || 0);

    // Step 2: Fetch reels via clips/user API with conservative pacing
    let maxId = "";
    let hasMore = true;
    let pageNum = 0;
    const MAX_PAGES = 6; // Max 6 pages x ~30 = ~180 posts, keeps API calls under 8

    while (results.length < safeLim && hasMore && pageNum < MAX_PAGES) {
      pageNum++;
      let postData = "target_user_id=" + userId + "&page_size=30";
      if (maxId) postData += "&max_id=" + maxId;

      console.log("Clips page", pageNum + "/" + MAX_PAGES, "total so far:", results.length);

      const clipsData = igApiFetch("https://i.instagram.com/api/v1/clips/user/", "POST", postData);

      if (!clipsData || clipsData.status !== "ok") {
        console.log("Clips API failed on page", pageNum, "status:", clipsData?.status);
        break;
      }

      const items = clipsData.items || [];
      if (items.length === 0) break;

      for (const item of items) {
        const media = item.media;
        if (!media) continue;
        if (results.find(r => r.shortcode === media.code)) continue;

        results.push({
          shortcode: media.code,
          video_url: "https://www.instagram.com/reel/" + media.code + "/",
          thumbnail_url: media.image_versions2?.candidates?.[0]?.url || null,
          caption: media.caption?.text || "",
          views: media.play_count || media.view_count || 0,
          likes: media.like_count || 0,
          comments: media.comment_count || 0,
          timestamp: media.taken_at || 0,
          is_video: true,
        });
      }

      hasMore = clipsData.paging_info?.more_available === true;
      maxId = clipsData.paging_info?.max_id || "";
      if (!hasMore || !maxId) break;

      // Conservative delay: 4-6 seconds between pages (randomized)
      const delay = 4000 + Math.floor(Math.random() * 2000);
      await new Promise(r => setTimeout(r, delay));
    }

    // Step 3: If clips returned fewer than safeLim, try feed for non-reel videos
    if (results.length < safeLim && pageNum < MAX_PAGES) {
      console.log("Clips gave", results.length, "reels, checking feed for more videos...");
      let feedMaxId = "";
      let feedHasMore = true;
      let feedPageNum = 0;
      const FEED_MAX_PAGES = 3;

      while (results.length < safeLim && feedHasMore && feedPageNum < FEED_MAX_PAGES) {
        feedPageNum++;
        let feedUrl = "https://i.instagram.com/api/v1/feed/user/" + userId + "/?count=30";
        if (feedMaxId) feedUrl += "&max_id=" + feedMaxId;

        const feedData = igApiFetch(feedUrl, "GET");
        if (!feedData || feedData.status !== "ok") break;

        const items = feedData.items || [];
        if (items.length === 0) break;

        for (const item of items) {
          if (item.media_type !== 2) continue;
          if (results.find(r => r.shortcode === item.code)) continue;

          results.push({
            shortcode: item.code,
            video_url: "https://www.instagram.com/reel/" + item.code + "/",
            thumbnail_url: item.image_versions2?.candidates?.[0]?.url || null,
            caption: item.caption?.text || "",
            views: item.view_count || item.play_count || 0,
            likes: item.like_count || 0,
            comments: item.comment_count || 0,
            timestamp: item.taken_at || 0,
            is_video: true,
          });
        }

        feedHasMore = feedData.more_available === true;
        feedMaxId = feedData.next_max_id || "";
        if (!feedHasMore || !feedMaxId) break;

        const delay = 4000 + Math.floor(Math.random() * 2000);
        await new Promise(r => setTimeout(r, delay));
      }
    }

    console.log("Final:", results.length, "posts for @" + username);
    // profileData comes from i.instagram.com/api/v1/users/<name>/usernameinfo/
    // — the MOBILE private API, whose shape is {user:{pk, follower_count,
    // profile_pic_url, profile_pic_url_hd}}. This block previously read
    // profileData.data.user.edge_followed_by.count, which is the WEB api shape
    // and never exists on this response, so profilePicUrl/followers came back
    // null on every Instagram scrape no matter how well it went — leaving IG
    // channels with no avatar and no follower_count. Web shape kept as a
    // fallback in case the resolve endpoint is ever switched back.
    const igUser = profileData?.user || profileData?.data?.user || null;
    const profilePic = igUser?.profile_pic_url_hd || igUser?.profile_pic_url || null;
    const igFollowers = igUser?.follower_count ?? igUser?.edge_followed_by?.count ?? null;
    return { posts: results.slice(0, safeLim), profilePicUrl: profilePic, followers: igFollowers };
  } catch (err) {
    console.error("Instagram scrape error:", err.message);
    return { posts: results, profilePicUrl: null };
  }
}

// ─── TikTok: yt-dlp --dump-json ───
async function scrapeTikTokProfile(username, limit) {
  const { execFile } = require("child_process");

  // Strip URL to username
  const ttUrlMatch = username.match(/tiktok\.com\/@([A-Za-z0-9_.]+)/);
  if (ttUrlMatch) username = ttUrlMatch[1];
  const cleanUser = username.replace(/^@/, "");
  const url = "https://www.tiktok.com/@" + cleanUser;

  return new Promise((resolve, reject) => {
    const args = [
      "--dump-json", "--skip-download", "--no-warnings", "--ignore-errors",
      "--playlist-end", String(limit), url,
    ];
    const proc = require("child_process").spawn("yt-dlp", args, { timeout: 180000 });

    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => (stdout += d));
    proc.stderr.on("data", (d) => (stderr += d.toString().slice(-500)));  // keep only last 500 chars

    proc.on("close", async (code) => {
      // Even with errors, parse whatever stdout we got
      const lines = stdout.trim().split("\n").filter(Boolean);
      if (lines.length === 0) {
        reject(new Error("TikTok scrape returned no results" + (stderr ? ": " + stderr.slice(-200) : "")));
        return;
      }

      const posts = [];
      for (const line of lines) {
        try {
          const d = JSON.parse(line);
          const views = d.view_count || 0;
          const likes = d.like_count || 0;
          const comments = d.comment_count || 0;
          posts.push({
            id: d.id,
            title: (d.title || "").slice(0, 600),
            views,
            likes,
            comments,
            engagement_rate: views > 0 ? +((likes + comments) / views * 100).toFixed(2) : 0,
            thumbnail: d.thumbnail || null,
            posted_at: d.upload_date
              ? d.upload_date.slice(0, 4) + "-" + d.upload_date.slice(4, 6) + "-" + d.upload_date.slice(6, 8)
              : null,
            url: "https://www.tiktok.com/@" + cleanUser + "/video/" + d.id,
            duration: d.duration || null,
          });
        } catch (e) { /* skip unparseable lines */ }
      }

      console.log("[scrape-profile] TikTok @" + cleanUser + ": parsed " + posts.length + " of " + lines.length + " lines");

      // Fetch TikTok avatar via Puppeteer (TikTok needs JS rendering)
      let ttAvatarUrl = null;
      try {
        const puppeteer = require('/var/www/node_modules/puppeteer');
        const browser = await puppeteer.launch({
          headless: "new",
          args: ['--no-sandbox', '--disable-setuid-sandbox', '--proxy-server=socks5://127.0.0.1:1080'],
        });
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');
        await page.goto("https://www.tiktok.com/@" + cleanUser, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await page.waitForSelector('img', { timeout: 5000 }).catch(() => {});
        ttAvatarUrl = await page.evaluate(() => {
          const og = document.querySelector('meta[property="og:image"]');
          if (og) return og.getAttribute('content');
          const selectors = ['img[data-e2e="user-avatar"]', 'img[class*="avatar"]', 'img[class*="Avatar"]'];
          for (const s of selectors) {
            const el = document.querySelector(s);
            if (el && el.src && !el.src.includes('data:')) return el.src;
          }
          return null;
        });
        await browser.close();
        console.log("[scrape-profile] TikTok @" + cleanUser + " avatar:", ttAvatarUrl ? ttAvatarUrl.slice(0, 80) : "not found");
      } catch (e) {
        console.log("[scrape-profile] TikTok avatar fetch error:", e.message?.slice(0, 100));
      }

      resolve({
        posts,
        username: cleanUser,
        platform: "tiktok",
        profilePicUrl: ttAvatarUrl,
        followers: null,
        totalPosts: posts.length,
      });
    });
  });
}

// ─── YouTube: yt-dlp --dump-json + WARP proxy ───
async function scrapeYouTubeProfile(username, limit) {
  const { execFile } = require("child_process");
  const { promisify } = require("util");
  const exec = promisify(execFile);

  // Strip URL to username
  const ytUrlMatch = username.match(/youtube\.com\/@([A-Za-z0-9_.-]+)/);
  if (ytUrlMatch) username = ytUrlMatch[1];
  const cleanUser = username.replace(/^@/, "");
  let url;
  if (username.startsWith("http")) {
    url = username.endsWith("/shorts") ? username : username + "/shorts";
  } else {
    url = "https://www.youtube.com/@" + cleanUser + "/shorts";
  }

  const { stdout } = await exec(
    "yt-dlp",
    [
      "--dump-json", "--skip-download", "--no-warnings", "--ignore-errors",
      "--playlist-end", String(limit),
      "--proxy", "socks5://127.0.0.1:1080", url,
    ],
    { timeout: 180000, maxBuffer: 50 * 1024 * 1024 }
  );

  const posts = stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try { var d = JSON.parse(line); } catch { return null; }
      const views = d.view_count || 0;
      const likes = d.like_count || 0;
      const comments = d.comment_count || 0;
      return {
        id: d.id,
        title: (d.title || "").slice(0, 600),
        views,
        likes,
        comments,
        engagement_rate: views > 0 ? +((likes + comments) / views * 100).toFixed(2) : 0,
        thumbnail: d.thumbnail || "https://i.ytimg.com/vi/" + d.id + "/maxresdefault.jpg",
        posted_at: d.upload_date
          ? d.upload_date.slice(0, 4) + "-" + d.upload_date.slice(4, 6) + "-" + d.upload_date.slice(6, 8)
          : null,
        url: "https://www.youtube.com/shorts/" + d.id,
        duration: d.duration || null,
      };
    }).filter(Boolean);

  // Fetch YouTube channel avatar from page HTML
  let ytAvatarUrl = null;
  try {
    const { execFileSync } = require("child_process");
    const channelPageUrl = "https://www.youtube.com/@" + cleanUser;
    const html = execFileSync("curl", [
      "-s", "-L", "--max-time", "10",
      "--proxy", "socks5://127.0.0.1:1080",
      "-H", "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      "-H", "Accept-Language: en-US,en;q=0.9",
      channelPageUrl,
    ], { maxBuffer: 5 * 1024 * 1024, timeout: 15000 }).toString();
    // Try og:image first (usually the channel avatar)
    const ogMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/);
    if (ogMatch) ytAvatarUrl = ogMatch[1];
    console.log("[scrape-profile] YouTube @" + cleanUser + " avatar:", ytAvatarUrl ? ytAvatarUrl.slice(0, 80) : "not found");
  } catch (e) {
    console.log("[scrape-profile] YouTube avatar fetch error:", e.message?.slice(0, 100));
  }

  return {
    posts,
    username: cleanUser,
    platform: "youtube",
    profilePicUrl: ytAvatarUrl,
    followers: null,
    totalPosts: posts.length,
  };
}


const http = require("http");
const { spawn } = require("child_process");
const { randomBytes } = require("crypto");
const fs = require("fs");
const path = require("path");
const os = require("os");
const https = require("https");

const crypto = require("crypto");

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
// ── Concurrency gate for heavy operations ────────────────────────────────────
let activeHeavy = 0;
const MAX_HEAVY = 8; // max concurrent ffmpeg/yt-dlp/Puppeteer ops
const HEAVY_PATHS = new Set([
  '/cobalt-proxy', '/ig-thumbnail', '/extract-audio',
  '/analyze-video', '/download-video', '/scrape-profile', '/scrape-reels-search',
  '/ig-profile-info'
]);

// ── Instagram account rotation ───────────────────────────────────────────────
// Auto-discover IG accounts: named files + any ig-account-*.json in /var/www/
const IG_COOKIE_FILES = [
  "/var/www/ig-cookies-2.json",

  ...fs.readdirSync("/var/www").filter(f => f.match(/^ig-account-\d+\.json$/)).map(f => `/var/www/${f}`),
].filter((f, i, a) => a.indexOf(f) === i) // dedupe
 .filter(f => { try { fs.statSync(f); return true; } catch { return false; } });
console.log(`[ig-rotate] Loaded ${IG_COOKIE_FILES.length} IG accounts:`, IG_COOKIE_FILES.map(f => f.split("/").pop()));
let igRotationIndex = 0;
const igStaleAccounts = new Set(); // temporarily skip accounts that got login_required

function getNextIgCookies() {
  if (IG_COOKIE_FILES.length === 0) return null;
  // Try each account, skip stale ones
  for (let i = 0; i < IG_COOKIE_FILES.length; i++) {
    const idx = (igRotationIndex + i) % IG_COOKIE_FILES.length;
    const file = IG_COOKIE_FILES[idx];
    if (igStaleAccounts.has(file)) continue;
    igRotationIndex = (idx + 1) % IG_COOKIE_FILES.length;
    try {
      const cookies = JSON.parse(fs.readFileSync(file, "utf8"));
      const cookieHeader = cookies.map(c => c.name + "=" + c.value).join("; ");
      const csrfToken = cookies.find(c => c.name === "csrftoken")?.value || "";
      console.log("[ig-rotate] Using", file.split("/").pop(), "(" + cookies.length + " cookies)");
      return { cookieHeader, csrfToken, file };
    } catch (e) {
      console.error("[ig-rotate] Failed to read", file, e.message);
    }
  }
  // All accounts stale — reset and try first
  console.warn("[ig-rotate] All accounts stale, resetting...");
  igStaleAccounts.clear();
  igRotationIndex = 0;
  return getNextIgCookies();
}

function markIgAccountStale(file) {
  console.warn("[ig-rotate] Marking stale:", file.split("/").pop());
  igStaleAccounts.add(file);
  // Auto-clear after 30 minutes
  setTimeout(() => { igStaleAccounts.delete(file); console.log("[ig-rotate] Unstaled:", file.split("/").pop()); }, 30 * 60 * 1000);
}

// Every way Instagram tells us a session is no longer usable. `user_has_logged_out`
// is what a 2FA-locked / remotely-signed-out account returns, and it was missing
// from every call site: the reply parses as a normal 200, so a dead session
// surfaced as an empty result set (or a per-row "not_found") while the account
// stayed in rotation, poisoning every subsequent request. Callers must still
// exempt the transient "please wait a few minutes" throttle, which arrives with
// require_login:true but must NEVER mark an account stale.
function isIgAuthFailure(parsed) {
  if (!parsed) return false;
  const m = parsed.message;
  return m === "login_required" || m === "challenge_required" ||
         m === "user_has_logged_out" || !!parsed.require_login;
}

// IG throttles usernameinfo/ (and web_profile_info) per acting account
// (ds_user_id). Strip it for calls to that endpoint only — everything else
// keeps the full authenticated jar. Shared with scrapeInstagramProfile's
// resolution step, which had this same one-liner inline.
function stripDsUserId(cookieHeader) {
  return cookieHeader.split("; ").filter((c) => !c.startsWith("ds_user_id=")).join("; ");
}

// ── Shared authed IG fetch (used by /ig-search and /ig-profile-info) ─────────
// Mirrors igApiFetch inside scrapeInstagramProfile, including the two rules
// that matter most:
//
//  1. Primary egress is the WARP SOCKS proxy; when WARP's exit IP is throttled
//     the SAME request is retried straight from the VPS IP. That fallback landed
//     in igApiFetch with 84342929 (WARP exit 104.28.205.117 answered every
//     request with the throttle message while the VPS IP returned full results
//     on identical cookies, and the throttle is sticky). igAuthedFetch was
//     written after that commit and never got it, so a throttled WARP made
//     /ig-search and /ig-profile-info fail 100% while every other scraper path
//     kept working.
//  2. A transient "please wait a few minutes" reply carries require_login:true
//     but must NOT mark the account stale. Doing so once dropped both live
//     accounts from rotation and returned 0 results until the rotation
//     auto-reset. A real auth failure (incl. user_has_logged_out) does mark it
//     stale on first sight, so a dead session leaves rotation immediately.
function igAuthedFetch(apiUrl, session) {
  const { execFileSync } = require("child_process");
  function buildArgs(useProxy) {
    const args = ["-s", "--max-time", "20"];
    if (useProxy) args.push("--socks5-hostname", "127.0.0.1:1080");
    args.push(
      "-H", "User-Agent: Instagram 344.0.0.0.98 Android (33/13; 420dpi; 1080x2340; samsung; SM-G991B; o1s; exynos2100)",
      "-H", "X-IG-App-ID: 936619743392459",
      "-H", "X-CSRFToken: " + session.csrfToken,
      "-H", "Cookie: " + session.cookieHeader,
      apiUrl,
    );
    return args;
  }

  const tag = (session.file || "").split("/").pop();
  let throttledAnywhere = false;
  for (const useProxy of [true, false]) {
    const via = useProxy ? "WARP" : "direct";
    let parsed;
    try {
      const raw = execFileSync("curl", buildArgs(useProxy), { maxBuffer: 10 * 1024 * 1024, timeout: 25000 });
      parsed = JSON.parse(raw.toString());
    } catch (e) {
      console.error("[ig-authed] fetch error (" + via + "):", (e.message || "").slice(0, 200));
      continue;
    }
    if (isIgAuthFailure(parsed)) {
      if (/please wait a few minutes/i.test(parsed.message || "")) {
        throttledAnywhere = true;
        console.warn("[ig-authed] Rate-limited via " + via + " (transient, not stale):", tag);
        continue;
      }
      console.warn("[ig-authed] Auth error:", parsed.message, "on", tag);
      if (session.file) markIgAccountStale(session.file);
      return { ok: false, reason: "auth" };
    }
    if (!useProxy) console.log("[ig-authed] Served via direct VPS IP (WARP throttled)");
    return { ok: true, data: parsed };
  }
  if (throttledAnywhere) {
    console.warn("[ig-authed] Rate-limited on BOTH WARP and direct egress");
    return { ok: false, reason: "throttled" };
  }
  return { ok: false, reason: "network" };
}

// Keyword -> Instagram accounts. Same topsearch_flat call /scrape-reels-search
// already runs in production, lifted out so lead prospecting can use it too.
function igTopSearch(query, limit, session) {
  const r = igAuthedFetch(
    "https://i.instagram.com/api/v1/fbsearch/topsearch_flat/?query=" +
      encodeURIComponent(query) + "&search_surface=top_search_page",
    session
  );
  if (!r.ok) return r;
  const list = (r.data && r.data.list) || [];
  // topsearch_flat omits follower_count for most hits. Report that as null, not
  // 0 — the consumer stores it verbatim, and a 0 reads as "this account has no
  // followers" in the UI and looks like real data that enrichment then "changes".
  const users = list
    .filter((item) => item.user && item.user.username)
    .map((item) => {
      const u = item.user;
      const id = u.pk != null ? String(u.pk) : u.pk_id != null ? String(u.pk_id) : null;
      return {
        username: String(u.username),
        user_id: id,
        full_name: typeof u.full_name === "string" && u.full_name !== "" ? u.full_name : null,
        follower_count: typeof u.follower_count === "number" && Number.isFinite(u.follower_count)
          ? u.follower_count : null,
        profile_pic_url: u.profile_pic_url || null,
        is_verified: !!u.is_verified,
        is_private: !!u.is_private,
      };
    })
    .slice(0, limit);
  return { ok: true, users };
}

// ── Session warming: periodically test IG sessions to detect issues early ─────
function warmIgSessions() {
  const { execSync } = require("child_process");
  for (const file of IG_COOKIE_FILES) {
    try {
      const cookies = JSON.parse(fs.readFileSync(file, "utf8"));
      const ch = cookies.map(c => c.name + "=" + c.value).join("; ");
      const csrf = (cookies.find(c => c.name === "csrftoken") || {}).value || "";
      const result = execSync(
        'curl -s --max-time 10 --socks5-hostname 127.0.0.1:1080 ' +
        '-H "User-Agent: Instagram 344.0.0.0.98 Android (33/13; 420dpi; 1080x2340; samsung; SM-G991B; o1s; exynos2100)" ' +
        '-H "X-IG-App-ID: 936619743392459" ' +
        '-H "X-CSRFToken: ' + csrf + '" ' +
        '-H "Cookie: ' + ch + '" ' +
        '"https://i.instagram.com/api/v1/accounts/current_user/?edit=true"',
        { timeout: 15000, maxBuffer: 2 * 1024 * 1024 }
      ).toString();
      const parsed = JSON.parse(result);
      if (parsed.user) {
        console.log("[ig-warm]", file.split("/").pop(), "— session OK for", parsed.user.username);
      } else if (isIgAuthFailure(parsed) && !/please wait a few minutes/i.test(parsed.message || "")) {
        // Includes user_has_logged_out, which the warmer used to ignore — a
        // remotely-signed-out account stayed in rotation for hours.
        console.warn("[ig-warm]", file.split("/").pop(), "— SESSION EXPIRED:", parsed.message);
        markIgAccountStale(file);
      }
    } catch (e) {
      console.error("[ig-warm]", file.split("/").pop(), "— check failed:", e.message?.slice(0, 80));
    }
  }
}

// Warm sessions on startup and every 4 hours
setTimeout(warmIgSessions, 10000);
setInterval(warmIgSessions, 4 * 60 * 60 * 1000);

const API_KEY = "ytdlp_connecta_2026_secret";
const PORT = 3099;

// ==================== VIDEO CACHE ====================
const VIDEO_CACHE_DIR = "/var/www/video-cache";
const VIDEO_CACHE_BASE_URL = "https://connectacreators.com/video-cache";

function getVideoCacheKey(url) {
  const igMatch = url.match(/instagram\.com\/(?:reel|reels|p)\/([A-Za-z0-9_-]+)/);
  if (igMatch) return `ig_${igMatch[1]}`;
  return crypto.createHash("md5").update(url).digest("hex");
}

function cacheVideo(originalUrl, sourcePath) {
  try {
    if (!fs.existsSync(VIDEO_CACHE_DIR)) fs.mkdirSync(VIDEO_CACHE_DIR, { recursive: true });
    const key = getVideoCacheKey(originalUrl);
    const cachePath = path.join(VIDEO_CACHE_DIR, `${key}.mp4`);
    if (!fs.existsSync(cachePath) || fs.statSync(cachePath).size < 1000) {
      fs.copyFileSync(sourcePath, cachePath);
      console.log("Video cached:", key);
    }
    return `${VIDEO_CACHE_BASE_URL}/${key}.mp4`;
  } catch (e) {
    console.error("Video cache write error:", e.message);
    return null;
  }
}

function getCachedVideo(url) {
  try {
    const key = getVideoCacheKey(url);
    const cachePath = path.join(VIDEO_CACHE_DIR, `${key}.mp4`);
    if (fs.existsSync(cachePath) && fs.statSync(cachePath).size > 1000) {
      console.log("Video cache HIT:", key);
      return cachePath;
    }
  } catch (_) {}
  return null;
}

const VIDEO_CACHE_MAX_BYTES = 2 * 1024 * 1024 * 1024; // 2GB hard cap
function cleanVideoCache() {
  try {
    if (!fs.existsSync(VIDEO_CACHE_DIR)) return;
    const cutoff = Date.now() - 12 * 60 * 60 * 1000; // 12h TTL (was 48h)
    let files = [];
    for (const f of fs.readdirSync(VIDEO_CACHE_DIR)) {
      const fp = path.join(VIDEO_CACHE_DIR, f);
      try {
        const st = fs.statSync(fp);
        if (st.mtimeMs < cutoff) { fs.unlinkSync(fp); console.log("Cache TTL evict:", f); }
        else files.push({ fp, size: st.size, mtime: st.mtimeMs });
      } catch (_) {}
    }
    // LRU size cap: evict oldest until under 2GB
    const totalSize = files.reduce((s, f) => s + f.size, 0);
    if (totalSize > VIDEO_CACHE_MAX_BYTES) {
      console.log(`[cache] Size ${(totalSize/1e9).toFixed(2)}GB > 2GB — LRU evicting...`);
      files.sort((a, b) => a.mtime - b.mtime);
      let freed = 0;
      for (const f of files) {
        if (totalSize - freed <= VIDEO_CACHE_MAX_BYTES * 0.75) break;
        try { fs.unlinkSync(f.fp); freed += f.size; console.log("Cache LRU evict:", path.basename(f.fp)); } catch(_) {}
      }
    }
  } catch (_) {}
}
setInterval(cleanVideoCache, 6 * 60 * 60 * 1000);
cleanVideoCache();

// Download a URL to a local file
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith("https") ? https : require("http");
    const file = fs.createWriteStream(destPath);
    const req = proto.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
      }
    }, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        file.close();
        fs.unlinkSync(destPath);
        return downloadFile(res.headers.location, destPath).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        file.close();
        return reject(new Error(`Download failed: ${res.statusCode}`));
      }
      res.pipe(file);
      file.on("finish", () => { file.close(); resolve(); });
    });
    req.on("error", reject);
  });
}

// Convert video/audio file to mp3 using ffmpeg
function convertToMp3(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    const proc = spawn("/usr/bin/ffmpeg", [
      "-y", "-i", inputPath,
      "-vn", "-ar", "16000", "-ac", "1", "-b:a", "64k",
      outputPath
    ]);
    let stderr = "";
    proc.stderr.on("data", (d) => { stderr += d.toString(); });
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg failed (${code}): ${stderr.slice(-200)}`));
    });
  });
}

// Get cobalt download URL for Instagram video
async function getCobaltVideoUrl(url) {
  const payload = JSON.stringify({ url });
  const options = {
    hostname: "localhost",
    port: 9001,
    path: "/",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "User-Agent": "Mozilla/5.0",
      "Content-Length": Buffer.byteLength(payload)
    }
  };

  return new Promise((resolve, reject) => {
    const req = require("http").request(options, (res) => {
      let body = "";
      res.on("data", (d) => { body += d; });
      res.on("end", () => {
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(new Error("Cobalt response parse error: " + body.slice(0, 200))); }
      });
    });
    req.on("error", reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error("Cobalt timeout")); });
    req.write(payload);
    req.end();
  });
}

// Try cobalt.tools API for Instagram URLs (returns mp3)
// originalUrl: the page URL (for cache keying); url may equal originalUrl
async function extractWithCobalt(url, mp3Path, originalUrl) {
  const tmpDir = os.tmpdir();
  const tmpVideo = path.join(tmpDir, `cobalt_${randomBytes(8).toString("hex")}.mp4`);

  const cobaltData = await getCobaltVideoUrl(url);
  console.log("Cobalt response status:", cobaltData.status);

  if (!cobaltData.url || !["stream", "tunnel", "redirect"].includes(cobaltData.status)) {
    throw new Error(`Cobalt returned status: ${cobaltData.status || "unknown"}`);
  }

  console.log("Downloading from cobalt URL...");
  await downloadFile(cobaltData.url, tmpVideo);

  const stat = fs.statSync(tmpVideo);
  console.log("Downloaded file size:", stat.size, "bytes");

  if (stat.size < 1000) {
    fs.unlinkSync(tmpVideo);
    throw new Error("Cobalt download too small, likely failed");
  }

  // Cache video for later visual analysis
  cacheVideo(originalUrl || url, tmpVideo);

  console.log("Converting to mp3...");
  await convertToMp3(tmpVideo, mp3Path);
  fs.unlinkSync(tmpVideo);
}

// Download Instagram video as mp4 via cobalt (keeps video for frame extraction)
async function downloadInstagramVideo(url, mp4Path) {
  const cobaltData = await getCobaltVideoUrl(url);
  console.log("Cobalt response status:", cobaltData.status);

  if (!cobaltData.url || !["stream", "tunnel", "redirect"].includes(cobaltData.status)) {
    throw new Error(`Cobalt returned status: ${cobaltData.status || "unknown"}`);
  }

  await downloadFile(cobaltData.url, mp4Path);

  const stat = fs.statSync(mp4Path);
  if (stat.size < 1000) {
    fs.unlinkSync(mp4Path);
    throw new Error("Cobalt video download too small");
  }
  console.log("Instagram video downloaded:", stat.size, "bytes");
}


// Write Instagram session cookies to a temp Netscape cookie file for yt-dlp
// Accepts optional accountFile path; defaults to first non-stale IG account
function writeIgCookieFile(accountFile) {
  const jsonPath = accountFile || IG_COOKIE_FILES.find(f => !igStaleAccounts.has(f)) || IG_COOKIE_FILES[0] || '/var/www/ig-cookies-2.json';
  try {
    const cookies = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    if (!Array.isArray(cookies) || cookies.length === 0) return null;
    const lines = cookies.map(c =>
      ['.instagram.com', 'TRUE', '/', c.secure ? 'TRUE' : 'FALSE', '0', c.name, c.value].join('\t')
    );
    const filePath = '/tmp/ig-yt-cookies-' + Date.now() + '.txt';
    fs.writeFileSync(filePath, '# Netscape HTTP Cookie File\n' + lines.join('\n'));
    return filePath;
  } catch (_) { return null; }
}

// Extract audio using yt-dlp. Instagram is routed through WARP (the bare VPS IP
// is rate-limited by IG) and rotates across non-stale accounts on auth/rate-limit
// errors — same resilience as the scrape + /stream-reel paths. This is only the
// FALLBACK: callers try Cobalt / a direct downloaded file first.
function extractWithYtDlp(url, outTemplate) {
  return new Promise((resolve, reject) => {
    // Reject Instagram profile URLs early — yt-dlp cannot extract from user pages
    const isIgProfile = url.includes('instagram.com') && !url.match(/\/(p|reels?|tv|stories)\/[^/]+/);
    if (isIgProfile) { reject(new Error('Cannot transcribe an Instagram profile page — paste a single reel or video URL instead')); return; }
    const isYouTube = /youtube\.com|youtu\.be/.test(url);
    const isInstagram = url.includes('instagram.com');

    // Instagram: try up to 2 non-stale accounts (fall back to the first known
    // account if every account is currently flagged stale).
    let igAccounts = [null];
    if (isInstagram) {
      igAccounts = IG_COOKIE_FILES.filter(f => !igStaleAccounts.has(f)).slice(0, 2);
      if (igAccounts.length === 0) igAccounts = [IG_COOKIE_FILES[0] || null];
    }

    const attempt = (idx, lastErr) => {
      if (idx >= igAccounts.length) { reject(new Error(`yt-dlp failed: ${lastErr || 'all accounts exhausted'}`)); return; }
      const igCookieFile = isInstagram ? writeIgCookieFile(igAccounts[idx]) : null;
      const args = [
        // Route Instagram through WARP too — direct-from-VPS-IP gets IG-blocked.
        ...((isYouTube || isInstagram) ? ['--proxy', 'socks5://127.0.0.1:1080'] : []),
        ...(igCookieFile ? ['--cookies', igCookieFile] : []),
        "--ffmpeg-location", "/usr/bin",
        "--extract-audio",
        "--audio-format", "mp3",
        "--audio-quality", "64K",
        "--no-playlist",
        "--no-warnings",
        "--no-check-certificates",
        "--js-runtimes", "node:/usr/bin/node",
        "--add-header", "User-Agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "-o", outTemplate,
        url
      ];
      const proc = spawn("/usr/local/bin/yt-dlp", args);
      let stderr = "";
      proc.stderr.on("data", (d) => { stderr += d.toString(); });
      proc.stdout.on("data", (d) => { console.log(d.toString()); });
      proc.on("close", (code) => {
        if (code === 0) { resolve(); return; }
        const err = stderr.slice(-300);
        const isAuthErr = /rate-limit|login required|not available|HTTP Error 401|HTTP Error 429|HTTP Error 404/i.test(stderr);
        if (isInstagram && isAuthErr && igAccounts[idx]) { try { markIgAccountStale(igAccounts[idx]); } catch (_) {} }
        if (isInstagram && idx + 1 < igAccounts.length) { attempt(idx + 1, err); return; }
        reject(new Error(`yt-dlp failed: ${err}`));
      });
    };
    attempt(0, null);
  });
}

// Download Facebook audio-only stream (avoids DASH video merge issues)
function downloadFacebookAudio(url, outTemplate) {
  return new Promise((resolve, reject) => {
    const args = [
      "-f", "bestaudio/best",
      "--no-playlist",
      "--no-warnings",
      "--no-check-certificates",
      "--ffmpeg-location", "/usr/bin",
      "--js-runtimes", "node:/usr/bin/node",
      "--add-header", "User-Agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      "-o", outTemplate,
      url
    ];
    const proc = spawn("/usr/local/bin/yt-dlp", args);
    let stderr = "";
    proc.stderr.on("data", (d) => { stderr += d.toString(); });
    proc.stdout.on("data", (d) => { console.log(d.toString()); });
    proc.on("close", (code) => {
      if (code !== 0) reject(new Error(`yt-dlp fb audio failed: ${stderr.slice(-400)}`));
      else resolve();
    });
  });
}



// Merge separate audio and video streams into a single MP4
function mergeAudioVideo(videoPath, audioPath, outputPath) {
  return new Promise((resolve, reject) => {
    const proc = spawn("/usr/bin/ffmpeg", [
      "-y",
      "-i", videoPath,
      "-i", audioPath,
      "-c:v", "copy",
      "-c:a", "aac",
      "-shortest",
      outputPath
    ]);
    let stderr = "";
    proc.stderr.on("data", (d) => { stderr += d.toString(); });
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg merge failed (${code}): ${stderr.slice(-200)}`));
    });
  });
}

// Extract Facebook audio using a headless browser (Puppeteer)
// Uses the DASH manifest embedded in the page (dash_manifest_xml_string key)
async function extractFacebookAudioWithBrowser(url) {
  const puppeteer = require('/var/www/node_modules/puppeteer');
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--disable-extensions',
      ]
    });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1280, height: 720 });

    let dashManifestXml = null;

    // Catch DASH manifest XML delivered over the network (some formats)
    page.on('response', async (response) => {
      if (dashManifestXml) return;
      const ct = (response.headers()['content-type'] || '');
      if (!ct.includes('xml') && !ct.includes('dash')) return;
      try {
        const text = await response.text();
        if (text.includes('AdaptationSet') && text.includes('audio')) {
          dashManifestXml = text;
          console.log('[FB-Puppeteer] Got DASH manifest via network, size:', text.length);
        }
      } catch (_) {}
    });

    console.log('[FB-Puppeteer] Loading page:', url);
    try {
      await page.goto(url, { waitUntil: 'networkidle0', timeout: 25000 });
    } catch (e) {
      console.log('[FB-Puppeteer] Nav timeout (ok):', e.message.slice(0, 60));
    }
    await new Promise(r => setTimeout(r, 2000));

    // Extract DASH manifest from page HTML using indexOf (reliable on large pages)
    if (!dashManifestXml) {
      dashManifestXml = await page.evaluate(() => {
        const html = document.documentElement.innerHTML;
        // Facebook embeds the DASH manifest as a JSON string under this key
        const key = '"dash_manifest_xml_string":"';
        const startIdx = html.indexOf(key);
        if (startIdx === -1) return null;

        const valueStart = startIdx + key.length;
        let i = valueStart;
        let raw = '';
        while (i < html.length) {
          if (html[i] === '\\') { raw += html[i] + (html[i+1]||''); i += 2; }
          else if (html[i] === '"') break;
          else { raw += html[i]; i++; }
        }
        try { return JSON.parse('"' + raw + '"'); } catch (e) { return null; }
      });
      if (dashManifestXml) {
        console.log('[FB-Puppeteer] Found DASH manifest (xml_string key), size:', dashManifestXml.length);
      }
    }

    if (dashManifestXml) {
      // Find audio AdaptationSet BaseURL
      const audioPatterns = [
        /<AdaptationSet[\s\S]*?contentType="audio"[\s\S]*?<BaseURL>([^<]+)<\/BaseURL>/,
        /<AdaptationSet[\s\S]*?mimeType="audio[^"]*"[\s\S]*?<BaseURL>([^<]+)<\/BaseURL>/,
        /<Representation[^>]*audioSamplingRate[^>]*>[\s\S]*?<BaseURL>([^<]+)<\/BaseURL>/,
      ];
      let audioUrl = null;
      for (const pat of audioPatterns) {
        const m = dashManifestXml.match(pat);
        if (m) {
          audioUrl = m[1].replace(/&amp;/g, '&');
          console.log('[FB-Puppeteer] Found audio BaseURL:', audioUrl.slice(0, 80));
          break;
        }
      }
      if (!audioUrl) {
        console.log('[FB-Puppeteer] Manifest found but no audio AdaptationSet. Snippet:', dashManifestXml.slice(0, 300));
        throw new Error('This Facebook video has no audio track — it may be a video-only reel.');
      }

      // Also extract best video BaseURL for caching/playback
      const videoPatterns = [
        /<AdaptationSet[\s\S]*?contentType="video"[\s\S]*?<BaseURL>([^<]+)<\/BaseURL>/,
        /<Representation[^>]*width="[^"]+"[^>]*>[\s\S]*?<BaseURL>([^<]+)<\/BaseURL>/,
      ];
      let videoUrl = null;
      // Pick highest bandwidth video representation
      let bestBandwidth = 0;
      const reprMatches = [...dashManifestXml.matchAll(/<Representation[^>]*bandwidth="(\d+)"[^>]*>[\s\S]*?<BaseURL>([^<]+)<\/BaseURL>/g)];
      for (const m of reprMatches) {
        const bw = parseInt(m[1]);
        const u = m[2];
        // Skip audio representations (audio BaseURL contains "audio" or has no width)
        if (!u.includes(audioUrl.slice(30, 60))) {
          if (bw > bestBandwidth) { bestBandwidth = bw; videoUrl = u.replace(/&amp;/g, '&'); }
        }
      }
      if (!videoUrl) {
        for (const pat of videoPatterns) {
          const m = dashManifestXml.match(pat);
          if (m) { videoUrl = m[1].replace(/&amp;/g, '&'); break; }
        }
      }
      if (videoUrl) console.log('[FB-Puppeteer] Found video BaseURL (bw=' + bestBandwidth + '):', videoUrl.slice(0, 80));

      return { audioUrl, videoUrl };
    }

    throw new Error('Facebook page did not expose a DASH manifest. Try pasting the video as a file instead.');
  } finally {
    if (browser) { try { await browser.close(); } catch (_) {} }
  }
}


// Download video (mp4) using yt-dlp for non-Instagram URLs
function downloadVideoWithYtDlp(url, outPath) {
  return new Promise((resolve, reject) => {
    const isYouTube = /youtube\.com|youtu\.be/.test(url);
    const isInstagram = url.includes('instagram.com');
    const igCookieFile = isInstagram ? writeIgCookieFile() : null;
    const args = [
      ...(isYouTube ? ['--proxy', 'socks5://127.0.0.1:1080'] : []),
      ...(igCookieFile ? ['--cookies', igCookieFile] : []),
      "-f", "best[height<=480][ext=mp4]/best[height<=480]/best",
      "--no-playlist",
      "--no-warnings",
      "--no-check-certificates",
      "--js-runtimes", "node:/usr/bin/node",
      "--add-header", "User-Agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      
      "-o", outPath,
      url
    ];
    const proc = spawn("/usr/local/bin/yt-dlp", args);
    let stderr = "";
    proc.stderr.on("data", (d) => { stderr += d.toString(); });
    proc.stdout.on("data", (d) => { console.log(d.toString()); });
    proc.on("close", (code) => {
      if (code !== 0) reject(new Error(`yt-dlp video download failed: ${stderr.slice(-300)}`));
      else resolve();
    });
  });
}

// Get video duration in seconds via ffprobe
function getVideoDuration(videoPath) {
  return new Promise((resolve, reject) => {
    const proc = spawn("/usr/bin/ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      videoPath
    ]);
    let out = "";
    proc.stdout.on("data", (d) => { out += d; });
    proc.on("close", (code) => {
      if (code === 0) resolve(parseFloat(out.trim()) || 0);
      else resolve(0);
    });
  });
}

// Extract JPEG frames from video at given interval
function extractFrames(videoPath, framesDir, intervalSeconds, maxFrames) {
  return new Promise((resolve, reject) => {
    const fps = 1 / intervalSeconds;
    const proc = spawn("/usr/bin/ffmpeg", [
      "-y", "-i", videoPath,
      "-vf", `fps=${fps},scale=640:-1`,
      "-q:v", "5",
      "-frames:v", String(maxFrames),
      path.join(framesDir, "frame_%03d.jpg")
    ]);
    let stderr = "";
    proc.stderr.on("data", (d) => { stderr += d.toString(); });
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg frame extraction failed (${code}): ${stderr.slice(-200)}`));
    });
  });
}

// Get volume statistics via ffmpeg volumedetect
function getVolumeStats(videoPath) {
  return new Promise((resolve) => {
    const proc = spawn("/usr/bin/ffmpeg", [
      "-y", "-i", videoPath,
      "-af", "volumedetect",
      "-f", "null", "/dev/null"
    ]);
    let stderr = "";
    proc.stderr.on("data", (d) => { stderr += d.toString(); });
    proc.on("close", () => {
      const meanMatch = stderr.match(/mean_volume:\s*([-\d.]+)\s*dB/);
      const maxMatch = stderr.match(/max_volume:\s*([-\d.]+)\s*dB/);
      resolve({
        mean_volume_db: meanMatch ? parseFloat(meanMatch[1]) : null,
        max_volume_db: maxMatch ? parseFloat(maxMatch[1]) : null
      });
    });
  });
}

// Read frames directory and return base64-encoded frames
function readFramesAsBase64(framesDir, durationSeconds, intervalSeconds) {
  const files = fs.readdirSync(framesDir)
    .filter(f => f.endsWith(".jpg"))
    .sort();

  return files.map((file, index) => {
    const timestamp = Math.round(index * intervalSeconds * 10) / 10;
    const data = fs.readFileSync(path.join(framesDir, file));
    return {
      timestamp,
      base64: data.toString("base64"),
      content_type: "image/jpeg"
    };
  });
}

// Parse JSON body from request
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      try { resolve(JSON.parse(body)); }
      catch (e) { reject(new Error("Invalid JSON")); }
    });
    req.on("error", reject);
  });
}


// ─── Video pre-cache globals ───────────────────────────────────────────────
const warmQueue = [];
let warmRunning = 0;

// ─── Lookahead prefetch map ───────────────────────────────────────────────
const prefetchedUrls = new Map(); // url → { cdnUrl, expiresAt }
let prefetchRunning = 0;
const PREFETCH_CONCURRENCY = 3;
// ─────────────────────────────────────────────────────────────────────────

// Clean up expired prefetch entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of prefetchedUrls) {
    if (v.expiresAt < now) prefetchedUrls.delete(k);
  }
}, 10 * 60 * 1000);
const WARM_CONCURRENCY = 2;

async function extractIgVideoCdnUrl(postUrl) {
  const puppeteer = require('/var/www/node_modules/puppeteer');
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu',
             '--mute-audio','--autoplay-policy=no-user-gesture-required','--disable-web-security']
    });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1');
    // Set IG session cookies
    try {

      const ppCookies = rawCookies.map(c => ({
        name: c.name, value: c.value,
        domain: c.domain || '.instagram.com', path: c.path || '/',
        secure: c.secure !== false, httpOnly: c.httpOnly || false,
      }));
      await page.setCookie(...ppCookies);
    } catch(e) { console.log('[precache] cookie load:', e.message); }

    let videoCdnUrl = null;

    // Intercept CDN video responses (works on both embed and main page)
    page.on('response', (response) => {
      if (videoCdnUrl) return;
      const u = response.url();
      const ct = response.headers()['content-type'] || '';
      if ((u.includes('cdninstagram.com') || u.includes('fbcdn.net') || u.includes('instagram.f')) &&
          (u.includes('.mp4') || ct.includes('video/'))) {
        videoCdnUrl = u;
        console.log('[precache] intercepted:', u.slice(0, 80));
      }
    });

    // Strategy 1: Use embed URL (no auth required, loads video directly)
    const baseUrl = postUrl.replace(/\/$/, '');
    const embedUrl = baseUrl + '/embed/';
    try {
      await page.goto(embedUrl, { waitUntil: 'networkidle2', timeout: 20000 });
    } catch(e) { console.log('[precache] embed nav:', e.message.slice(0, 60)); }
    await new Promise(r => setTimeout(r, 4000));

    // Get video src from DOM if network interception missed it
    if (!videoCdnUrl) {
      videoCdnUrl = await page.evaluate(() => {
        const v = document.querySelector('video[src]');
        if (v && v.src && !v.src.startsWith('blob:')) return v.src;
        const s = document.querySelector('video source[src]');
        if (s && s.src && !s.src.startsWith('blob:')) return s.src;
        return null;
      }).catch(() => null);
      if (videoCdnUrl) console.log('[precache] got from DOM:', videoCdnUrl.slice(0, 80));
    }

    // Strategy 2: Main page with cookies (fallback)
    if (!videoCdnUrl) {
      try {
        await page.goto(postUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
      } catch(e) {}
      await new Promise(r => setTimeout(r, 4000));
      // og:video meta
      if (!videoCdnUrl) {
        videoCdnUrl = await page.evaluate(() => {
          const m = document.querySelector('meta[property="og:video"]') ||
                    document.querySelector('meta[property="og:video:url"]');
          return m ? m.getAttribute('content') : null;
        }).catch(() => null);
        if (videoCdnUrl) console.log('[precache] og:video:', videoCdnUrl.slice(0, 80));
      }
      // video DOM
      if (!videoCdnUrl) {
        videoCdnUrl = await page.evaluate(() => {
          const v = document.querySelector('video[src]');
          return (v && v.src && !v.src.startsWith('blob:')) ? v.src : null;
        }).catch(() => null);
        if (videoCdnUrl) console.log('[precache] video DOM main:', videoCdnUrl.slice(0, 80));
      }
    }

    console.log('[precache] result for', postUrl.slice(-20), ':', videoCdnUrl ? 'FOUND' : 'NOT FOUND');
    return videoCdnUrl;
  } finally {
    if (browser) try { await browser.close(); } catch(_) {}
  }
}

async function downloadVideoToCache(cdnUrl, cachePath) {
  return new Promise((resolve, reject) => {
    const tmpPath = cachePath + '.tmp';
    const proto2 = cdnUrl.startsWith('https') ? require('https') : require('http');
    proto2.get(cdnUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' }
    }, (res) => {
      if (res.statusCode !== 200 && res.statusCode !== 206) {
        reject(new Error('CDN HTTP ' + res.statusCode)); return;
      }
      const ws = fs.createWriteStream(tmpPath);
      res.pipe(ws);
      ws.on('finish', () => {
        try {
          const stat = fs.statSync(tmpPath);
          if (stat.size < 50000) { try { fs.unlinkSync(tmpPath); } catch(_){} reject(new Error('Too small: ' + stat.size)); return; }
          fs.renameSync(tmpPath, cachePath);
          resolve(stat.size);
        } catch(e) { reject(e); }
      });
      ws.on('error', e => { try { fs.unlinkSync(tmpPath); } catch(_){} reject(e); });
    }).on('error', reject);
  });
}

async function processWarmQueue() {
  while (warmQueue.length > 0 && warmRunning < WARM_CONCURRENCY) {
    const item = warmQueue.shift();
    warmRunning++;
    (async () => {
      try {
        const { url, platform } = item;
        const urlId = (url.match(/\/reel\/([^/?]+)/) || url.match(/\/p\/([^/?]+)/) ||
                      url.match(/\/video\/([^/?]+)/) || url.match(/\/shorts\/([^/?]+)/))?.[1];
        if (!urlId) return;
        const plat = platform === 'instagram' ? 'ig' : platform === 'tiktok' ? 'tt' : 'yt';
        const cachePath = '/var/www/video-cache/' + plat + '_' + urlId + '.mp4';
        if (fs.existsSync(cachePath)) { console.log('[precache] already cached:', urlId); return; }
        console.log('[precache] processing:', platform, urlId);
        let cdnUrl = null;
        if (platform === 'instagram') {
          cdnUrl = await extractIgVideoCdnUrl(url);
        } else {
          const { execFile } = require('child_process');
          cdnUrl = await new Promise((resolve) => {
            execFile('/usr/local/bin/yt-dlp', ['--get-url', '-f', 'best[ext=mp4]/best', '--no-playlist', '-q', url],
              { timeout: 30000 }, (err, stdout) => resolve(err ? null : stdout.trim().split('\n')[0]));
          });
        }
        if (!cdnUrl) { console.log('[precache] no CDN URL for:', urlId); return; }
        const size = await downloadVideoToCache(cdnUrl, cachePath);
        console.log('[precache] done:', urlId, Math.round(size/1024/1024) + 'MB');
      } catch(e) {
        console.error('[precache] error:', e.message);
      } finally {
        warmRunning--;
        processWarmQueue();
      }
    })();
  }
}

try { fs.mkdirSync('/var/www/video-cache', { recursive: true }); } catch(_) {}
// ───────────────────────────────────────────────────────────────────────────

// ── Per-IP rate limiting for scrape endpoints ────────────────────────────────
const RATE_WINDOWS = new Map(); // ip → { count, resetAt }
const RATE_LIMITS = {
  '/scrape-profile':      { max: 30,  windowMs: 60 * 1000 },  // 30/min per IP
  '/scrape-reels-search': { max: 20,  windowMs: 60 * 1000 },  // 20/min per IP
  '/extract-audio':       { max: 20,  windowMs: 60 * 1000 },  // 20/min per IP
  '/analyze-video':       { max: 10,  windowMs: 60 * 1000 },  // 10/min per IP
  '/cobalt-proxy':        { max: 60,  windowMs: 60 * 1000 },  // 60/min per IP
};
setInterval(() => {
  const now = Date.now();
  for (const [key, w] of RATE_WINDOWS) { if (w.resetAt < now) RATE_WINDOWS.delete(key); }
}, 5 * 60 * 1000);

function checkRateLimit(ip, path) {
  const rule = RATE_LIMITS[path];
  if (!rule) return true;
  const key = `${ip}:${path}`;
  const now = Date.now();
  let w = RATE_WINDOWS.get(key);
  if (!w || w.resetAt < now) { w = { count: 0, resetAt: now + rule.windowMs }; RATE_WINDOWS.set(key, w); }
  w.count++;
  return w.count <= rule.max;
}

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "content-type, x-api-key");

  if (req.method === "OPTIONS") { res.writeHead(200); res.end(); return; }

  // ── Per-IP rate limiting ─────────────────────────────────────────────────────
  // The trusted internal caller (analyzer batch drain, x-api-key) is exempt: its
  // requests all originate from a few Supabase egress IPs, so the per-IP cap would
  // throttle legitimate batch work as if it were one abusive client. Backpressure
  // for internal traffic is handled by the concurrency gate (503) below instead.
  if (req.method === "POST" && RATE_LIMITS[req.url]) {
    const isInternal = req.headers["x-api-key"] === API_KEY;
    const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress;
    if (!isInternal && !checkRateLimit(ip, req.url)) {
      res.writeHead(429, corsHeaders);
      res.end(JSON.stringify({ error: "Rate limit exceeded — slow down" }));
      return;
    }
  }

  // ── Concurrency gate: reject heavy requests when server is at capacity ──────
  if (req.method === "POST" && HEAVY_PATHS.has(req.url)) {
    if (activeHeavy >= MAX_HEAVY) {
      console.warn(`[gate] BUSY (active=${activeHeavy}) — rejecting ${req.url}`);
      res.writeHead(503, { 'Content-Type': 'application/json', 'Retry-After': '10' });
      res.end(JSON.stringify({ error: 'Server busy, please retry in a moment', active: activeHeavy }));
      return;
    }
    activeHeavy++;
    console.log(`[gate] START ${req.url} (active=${activeHeavy})`);
    const _done = () => { activeHeavy = Math.max(0, activeHeavy - 1); console.log(`[gate] END ${req.url} (active=${activeHeavy})`); };
    res.on('finish', _done);
    res.on('close', _done); // handles dropped connections
  }

  // ==================== /proxy-image ====================
  // Proxies Instagram/Facebook CDN images (expired CDN URLs still work via server IP)
  if (req.method === "GET" && req.url.startsWith("/proxy-image")) {
    try {
      const parsedUrl = new URL("http://localhost" + req.url);
      const imageUrl = parsedUrl.searchParams.get("url");
      if (!imageUrl) { res.writeHead(400); res.end(); return; }
      const https = require("https");
      const httpModule = require("http");
      const proto = imageUrl.startsWith("https") ? https : httpModule;
      proto.get(imageUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          "Referer": "https://www.instagram.com/"
        }
      }, (imgRes) => {
        if (imgRes.statusCode !== 200) { res.writeHead(imgRes.statusCode); res.end(); return; }
        res.writeHead(200, {
          "Content-Type": imgRes.headers["content-type"] || "image/jpeg",
          "Cache-Control": "public, max-age=86400",
          "Access-Control-Allow-Origin": "*"
        });
        imgRes.pipe(res);
      }).on("error", () => { res.writeHead(502); res.end(); });
    } catch (e) { res.writeHead(500); res.end(); }
    return;
  }


  // ==================== /resolve-thumb ====================
  // For TikTok/YouTube: gets a fresh thumbnail URL via yt-dlp, caches to disk
  if (req.method === "GET" && req.url.startsWith("/resolve-thumb")) {
    try {
      const parsedUrl = new URL("http://localhost" + req.url);
      const videoUrl = parsedUrl.searchParams.get("url");
      if (!videoUrl) { res.writeHead(400); res.end("Missing url param"); return; }

      // Extract video ID and platform
      const cacheId = (videoUrl.match(/\/video\/([^/?]+)/) || videoUrl.match(/\/shorts\/([^/?]+)/) ||
                       videoUrl.match(/\/reel\/([^/?]+)/) || videoUrl.match(/\/p\/([^/?]+)/))?.[1];
      const platform = videoUrl.includes("tiktok") ? "tt" : videoUrl.includes("youtube") ? "yt" : "ig";
      const cachePath = cacheId ? `/var/www/thumb-cache/${platform}_${cacheId}.jpg` : null;

      // Serve from cache if exists
      if (cachePath && fs.existsSync(cachePath)) {
        const stat = fs.statSync(cachePath);
        res.writeHead(200, {
          "Content-Type": "image/jpeg",
          "Content-Length": stat.size,
          "Cache-Control": "public, max-age=604800",
          "Access-Control-Allow-Origin": "*",
        });
        fs.createReadStream(cachePath).pipe(res);
        return;
      }

      // ── YouTube: use direct i.ytimg.com URL (permanent, never expires) ──
      if (platform === "yt" && cacheId) {
        const ytThumbUrl = "https://i.ytimg.com/vi/" + cacheId + "/hqdefault.jpg";
        const https = require("https");
        https.get(ytThumbUrl, {
          headers: { "User-Agent": "Mozilla/5.0" },
        }, (imgRes) => {
          if (imgRes.statusCode !== 200) {
            res.writeHead(imgRes.statusCode || 404, { "Access-Control-Allow-Origin": "*" });
            res.end();
            return;
          }
          res.writeHead(200, {
            "Content-Type": imgRes.headers["content-type"] || "image/jpeg",
            "Cache-Control": "public, max-age=604800",
            "Access-Control-Allow-Origin": "*",
          });
          if (cachePath) {
            const cacheStream = fs.createWriteStream(cachePath);
            let cacheOK = true;
            cacheStream.on("error", () => { cacheOK = false; });
            imgRes.on("data", (chunk) => { res.write(chunk); if (cacheOK) cacheStream.write(chunk); });
            imgRes.on("end", () => { res.end(); if (cacheOK) cacheStream.end(); });
          } else {
            imgRes.pipe(res);
          }
        }).on("error", () => {
          res.writeHead(502, { "Access-Control-Allow-Origin": "*" });
          res.end();
        });
        return;
      }

      // ── Instagram: use IG private API + cookies (yt-dlp has no cookies on this VPS) ──
      if (platform === "ig" && cacheId) {
        try {
          const igAccount = getNextIgCookies();
          if (!igAccount) throw new Error("No IG cookies available");
          const { cookieHeader, csrfToken } = igAccount;
          const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
          let mediaId = BigInt(0);
          for (const ch of cacheId) mediaId = mediaId * BigInt(64) + BigInt(alphabet.indexOf(ch));
          const { execFileSync } = require("child_process");
          const result = execFileSync("curl", [
            "-s", "--max-time", "10",
            "--socks5-hostname", "127.0.0.1:1080",
            "-H", "User-Agent: Instagram 344.0.0.0.98 Android (33/13; 420dpi; 1080x2340; samsung; SM-G991B; o1s; exynos2100)",
            "-H", "X-IG-App-ID: 936619743392459",
            "-H", "X-CSRFToken: " + csrfToken,
            "-H", "Cookie: " + cookieHeader,
            "https://i.instagram.com/api/v1/media/" + mediaId.toString() + "/info/"
          ], { timeout: 15000 });
          const data = JSON.parse(result.toString());
          const thumbUrl = data?.items?.[0]?.image_versions2?.candidates?.[0]?.url;
          if (thumbUrl) {
            const https = require("https");
            https.get(thumbUrl, {
              headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
            }, (imgRes) => {
              if (imgRes.statusCode !== 200) {
                res.writeHead(imgRes.statusCode, { "Access-Control-Allow-Origin": "*" });
                res.end();
                return;
              }
              res.writeHead(200, {
                "Content-Type": imgRes.headers["content-type"] || "image/jpeg",
                "Cache-Control": "public, max-age=604800",
                "Access-Control-Allow-Origin": "*",
              });
              if (cachePath) {
                const cacheStream = fs.createWriteStream(cachePath);
                let cacheOK = true;
                cacheStream.on("error", () => { cacheOK = false; });
                imgRes.on("data", (chunk) => { res.write(chunk); if (cacheOK) cacheStream.write(chunk); });
                imgRes.on("end", () => { res.end(); if (cacheOK) cacheStream.end(); });
              } else {
                imgRes.pipe(res);
              }
            }).on("error", () => {
              res.writeHead(502, { "Access-Control-Allow-Origin": "*" });
              res.end();
            });
            return;
          }
        } catch (e) {
          console.log("[resolve-thumb] IG API failed for", cacheId, ":", e.message?.slice(0, 80));
        }
      }

      // Use yt-dlp to get fresh thumbnail URL
      const { execFile } = require("child_process");
      execFile("/usr/local/bin/yt-dlp", ["--get-thumbnail", "--no-playlist", "-q", videoUrl],
        { timeout: 15000 }, (err, stdout) => {
          if (err || !stdout.trim()) {
            res.writeHead(404, { "Access-Control-Allow-Origin": "*" });
            res.end("Could not resolve thumbnail");
            return;
          }
          const thumbUrl = stdout.trim().split("\n")[0];
          const https = require("https");
          const httpModule = require("http");
          const proto = thumbUrl.startsWith("https") ? https : httpModule;

          proto.get(thumbUrl, {
            headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
          }, (imgRes) => {
            if (imgRes.statusCode !== 200) {
              res.writeHead(imgRes.statusCode, { "Access-Control-Allow-Origin": "*" });
              res.end();
              return;
            }
            const contentType = imgRes.headers["content-type"] || "image/jpeg";
            res.writeHead(200, {
              "Content-Type": contentType,
              "Cache-Control": "public, max-age=604800",
              "Access-Control-Allow-Origin": "*",
            });

            // Tee to cache
            if (cachePath) {
              const cacheStream = fs.createWriteStream(cachePath);
              let cacheOK = true;
              cacheStream.on("error", () => { cacheOK = false; });
              imgRes.on("data", (chunk) => { res.write(chunk); if (cacheOK) cacheStream.write(chunk); });
              imgRes.on("end", () => {
                res.end();
                if (cacheOK) cacheStream.end();
              });
            } else {
              imgRes.pipe(res);
            }
          }).on("error", () => {
            res.writeHead(502, { "Access-Control-Allow-Origin": "*" });
            res.end("Proxy error");
          });
        }
      );
    } catch (e) { res.writeHead(500); res.end(); }
    return;
  }



  // ==================== /warm-cache (pre-cache videos via Puppeteer) ====================
  if ((req.method === "POST" || req.method === "OPTIONS") && req.url === "/warm-cache") {
    if (req.method === "OPTIONS") { res.writeHead(204, corsHeaders); res.end(); return; }
    let body = '';
    req.on('data', d => { body += d; });
    req.on('end', () => {
      try {
        const { videos } = JSON.parse(body || '{}');
        const toQueue = (videos || []).filter(v => {
          const urlId = (v.url.match(/\/reel\/([^/?]+)/) || v.url.match(/\/p\/([^/?]+)/) ||
                        v.url.match(/\/video\/([^/?]+)/) || v.url.match(/\/shorts\/([^/?]+)/))?.[1];
          if (!urlId) return false;
          const plat = v.platform === 'instagram' ? 'ig' : v.platform === 'tiktok' ? 'tt' : 'yt';
          return !fs.existsSync('/var/www/video-cache/' + plat + '_' + urlId + '.mp4');
        });
        const added = toQueue.slice(0, 20);
        warmQueue.push(...added);
        processWarmQueue();
        res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ queued: added.length, queue_size: warmQueue.length }));
      } catch(e) {
        res.writeHead(400, corsHeaders); res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // ==================== /cache-status ====================
  if (req.method === "GET" && req.url.startsWith("/cache-status")) {
    try {
      const pUrl = new URL("http://localhost" + req.url);
      const ids = (pUrl.searchParams.get("ids") || "").split(",").filter(Boolean);
      const result = {};
      ids.forEach(id => {
        result[id] = fs.existsSync('/var/www/video-cache/ig_' + id + '.mp4') ||
                     fs.existsSync('/var/www/video-cache/tt_' + id + '.mp4') ||
                     fs.existsSync('/var/www/video-cache/yt_' + id + '.mp4');
      });
      res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch(e) { res.writeHead(500); res.end('{}'); }
    return;
  }

  // ==================== /prefetch (lookahead CDN URL resolution) ====================
  if ((req.method === "POST" || req.method === "OPTIONS") && req.url === "/prefetch") {
    if (req.method === "OPTIONS") { res.writeHead(204, corsHeaders); res.end(); return; }
    let body = "";
    req.on("data", d => { body += d; });
    req.on("end", () => {
      try {
        const { videos } = JSON.parse(body || "{}");
        let queued = 0;
        (videos || []).forEach(({ url, platform }) => {
          if (!url) return;
          // Skip if disk-cached
          const urlId = (url.match(/\/reel\/([^/?]+)/) || url.match(/\/p\/([^/?]+)/) ||
                        url.match(/\/video\/([^/?]+)/) || url.match(/\/shorts\/([^/?]+)/))?.[1];
          if (urlId) {
            const plat = platform === "instagram" ? "ig" : platform === "tiktok" ? "tt" : "yt";
            if (fs.existsSync("/var/www/video-cache/" + plat + "_" + urlId + ".mp4")) return;
          }
          // Skip if already in prefetch map and not expired
          const existing = prefetchedUrls.get(url);
          if (existing && existing.expiresAt > Date.now()) return;
          // Skip if at concurrency limit
          if (prefetchRunning >= PREFETCH_CONCURRENCY) return;
          prefetchRunning++;
          queued++;
          (async () => {
            try {
              const cobaltBody = JSON.stringify({ url, videoQuality: "720", filenameStyle: "basic", downloadMode: "auto" });
              const cdnResult = await new Promise((resolve, reject) => {
                const hr = require("http").request("http://localhost:9001/", {
                  method: "POST",
                  headers: { "Content-Type": "application/json", "Accept": "application/json", "Content-Length": Buffer.byteLength(cobaltBody) },
                }, (r2) => {
                  let d = ""; r2.on("data", c => { d += c; }); r2.on("end", () => resolve(d));
                });
                hr.on("error", reject);
                hr.setTimeout(15000, () => { hr.destroy(); reject(new Error("Cobalt timeout")); });
                hr.write(cobaltBody); hr.end();
              });
              const parsed = JSON.parse(cdnResult);
              const cdnUrl = parsed?.url || (Array.isArray(parsed?.urls) ? parsed.urls[0] : null);
              if (cdnUrl) {
                prefetchedUrls.set(url, { cdnUrl, expiresAt: Date.now() + 5 * 60 * 1000 });
                console.log("[prefetch] resolved:", url.slice(-30));
              } else {
                console.log("[prefetch] no CDN URL from Cobalt for:", url.slice(-30));
              }
            } catch (e) {
              console.log("[prefetch] failed:", e.message.slice(0, 80));
            } finally {
              prefetchRunning--;
            }
          })();
        });
        res.writeHead(200, { ...corsHeaders, "Content-Type": "application/json" });
        res.end(JSON.stringify({ queued }));
      } catch (e) {
        res.writeHead(400, corsHeaders); res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }


  // ==================== /resolve-batch (batch video pre-caching) ====================
  if ((req.method === "POST" || req.method === "OPTIONS") && req.url === "/resolve-batch") {
    if (req.method === "OPTIONS") { res.writeHead(204, corsHeaders); res.end(); return; }
    let body = "";
    req.on("data", d => { body += d; });
    req.on("end", async () => {
      try {
        const { videos } = JSON.parse(body || "{}");
        if (!Array.isArray(videos) || videos.length === 0) {
          res.writeHead(200, { ...corsHeaders, "Content-Type": "application/json" });
          res.end(JSON.stringify({ results: {}, failed: [] }));
          return;
        }

        const results = {};
        const failed = [];

        function extractCode(url) {
          const m = url.match(/\/reel\/([^/?]+)/) || url.match(/\/p\/([^/?]+)/) ||
                    url.match(/\/video\/([^/?]+)/) || url.match(/\/shorts\/([^/?]+)/);
          return m ? m[1] : null;
        }

        function platPrefix(platform) {
          if (platform === "instagram") return "ig";
          if (platform === "tiktok") return "tt";
          return "yt";
        }

        // Resolve a single video — returns { code, url } or null
        async function resolveOne(video) {
          const code = extractCode(video.url);
          if (!code) return null;
          const prefix = platPrefix(video.platform);
          const cachePath = "/var/www/video-cache/" + prefix + "_" + code + ".mp4";

          // Check disk cache first
          if (fs.existsSync(cachePath)) {
            return { code, url: "https://connectacreators.com/video-cache/" + prefix + "_" + code + ".mp4" };
          }

          let cdnUrl = null;

          try {
            if (video.platform === "instagram") {
              // IG Private API
              const ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
              let mediaId = BigInt(0);
              for (const c of code) mediaId = mediaId * BigInt(64) + BigInt(ALPHA.indexOf(c));

              const igAccount = getNextIgCookies();
              if (igAccount) {
                const curlCmd = 'curl -s --max-time 15 --proxy socks5h://127.0.0.1:1080 ' +
                  '-H "User-Agent: Instagram 344.0.0.0.98 Android (33/13; 420dpi; 1080x2340; samsung; SM-G991B; o1s; exynos2100)" ' +
                  '-H "Cookie: ' + igAccount.cookieHeader + '" ' +
                  '"https://i.instagram.com/api/v1/media/' + mediaId.toString() + '/info/"';
                try {
                  const { stdout } = await new Promise((resolve, reject) => {
                    require("child_process").exec(curlCmd, { timeout: 20000, maxBuffer: 5 * 1024 * 1024 }, (err, stdout, stderr) => {
                      if (err) reject(err); else resolve({ stdout, stderr });
                    });
                  });
                  const data = JSON.parse(stdout);
                  if (data.message === "login_required") markIgAccountStale(igAccount.file);
                  const item = data.items && data.items[0];
                  if (item) {
                    const versions = item.video_versions || (item.carousel_media && item.carousel_media[0] && item.carousel_media[0].video_versions);
                    if (versions && versions.length) cdnUrl = versions[0].url;
                  }
                } catch (e) {
                  console.log("[resolve-batch] IG API failed for " + code + ":", e.message && e.message.slice(0, 80));
                }
              }
            } else if (video.platform === "tiktok") {
              // Cobalt
              try {
                const cobaltBody = JSON.stringify({ url: video.url, videoQuality: "720" });
                const cobaltResult = await new Promise((resolve, reject) => {
                  const hr = require("http").request("http://localhost:9001/", {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "Accept": "application/json", "Content-Length": Buffer.byteLength(cobaltBody) },
                  }, (r2) => {
                    let d = ""; r2.on("data", c => { d += c; }); r2.on("end", () => resolve(d));
                  });
                  hr.on("error", reject);
                  hr.setTimeout(20000, () => { hr.destroy(); reject(new Error("Cobalt timeout")); });
                  hr.write(cobaltBody); hr.end();
                });
                const parsed = JSON.parse(cobaltResult);
                if (parsed.status === "redirect" || parsed.status === "stream") cdnUrl = parsed.url;
                else if (parsed.status === "picker" && parsed.picker && parsed.picker[0]) cdnUrl = parsed.picker[0].url;
              } catch (e) {
                console.log("[resolve-batch] Cobalt failed for " + code + ":", e.message && e.message.slice(0, 80));
              }
            } else {
              // YouTube — yt-dlp
              try {
                const { stdout } = await new Promise((resolve, reject) => {
                  require("child_process").exec(
                    'yt-dlp --get-url -f "best[height<=720]" "' + video.url + '"',
                    { timeout: 20000 },
                    (err, stdout) => { if (err) reject(err); else resolve({ stdout }); }
                  );
                });
                const line = stdout.trim().split("\n")[0];
                if (line) cdnUrl = line;
              } catch (e) {
                console.log("[resolve-batch] yt-dlp failed for " + code + ":", e.message && e.message.slice(0, 80));
              }
            }

            // Download to cache if we got a CDN URL
            if (cdnUrl) {
              const tmpPath = cachePath + ".tmp";
              try {
                await new Promise((resolve, reject) => {
                  require("child_process").exec(
                    'curl -s -L --max-time 30 -o "' + tmpPath + '" "' + cdnUrl.replace(/"/g, '\\"') + '"',
                    { timeout: 35000 },
                    (err) => { if (err) reject(err); else resolve(); }
                  );
                });
                const stat = fs.statSync(tmpPath);
                if (stat.size < 1000) {
                  try { fs.unlinkSync(tmpPath); } catch(_){}
                  console.log("[resolve-batch] Downloaded file too small for " + code);
                  return null;
                }
                fs.renameSync(tmpPath, cachePath);
                console.log("[resolve-batch] Cached:", prefix + "_" + code + ".mp4", "(" + Math.round(stat.size / 1024) + "KB)");
                return { code, url: "https://connectacreators.com/video-cache/" + prefix + "_" + code + ".mp4" };
              } catch (e) {
                try { fs.unlinkSync(tmpPath); } catch(_){}
                console.log("[resolve-batch] Download failed for " + code + ":", e.message && e.message.slice(0, 80));
                return null;
              }
            }
            return null;
          } catch (err) {
            console.error("[resolve-batch] Error for " + code + ":", err.message);
            return null;
          }
        }

        // Process videos with concurrency limit of 3
        const BATCH_CONCURRENCY = 3;
        for (let i = 0; i < videos.length; i += BATCH_CONCURRENCY) {
          const chunk = videos.slice(i, i + BATCH_CONCURRENCY);
          const settled = await Promise.allSettled(
            chunk.map(v => {
              const code = extractCode(v.url);
              return Promise.race([
                resolveOne(v),
                new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 30000)),
              ]).then(result => {
                if (result) results[result.code] = result.url;
                else if (code) failed.push(code);
              }).catch(() => { if (code) failed.push(code); });
            })
          );
        }

        console.log("[resolve-batch] Done:", Object.keys(results).length, "resolved,", failed.length, "failed");
        res.writeHead(200, { ...corsHeaders, "Content-Type": "application/json" });
        res.end(JSON.stringify({ results, failed }));
      } catch (e) {
        console.error("[resolve-batch] Error:", e.message);
        res.writeHead(400, { ...corsHeaders, "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // ==================== /stream-reel ====================
  // Single GET endpoint: resolves video URL via Cobalt then streams directly
  // Browser video element just sets src="/stream-reel?url=..." for instant playback
  if (req.method === "GET" && req.url.startsWith("/stream-reel")) {
    try {
      const parsedUrl = new URL("http://localhost" + req.url);
      const videoUrl = parsedUrl.searchParams.get("url");
      if (!videoUrl) { res.writeHead(400); res.end("Missing url param"); return; }

      const rangeHeader = req.headers["range"];

      // Check video cache first (instant)
      const cacheId = videoUrl.match(/\/reel\/([^/?]+)/)?.[1]
        || videoUrl.match(/\/p\/([^/?]+)/)?.[1]
        || videoUrl.match(/\/video\/([^/?]+)/)?.[1]
        || videoUrl.match(/\/shorts\/([^/?]+)/)?.[1];
      // Hoist platform/cachePath so they're in scope for async callbacks (fixes ReferenceError)
      const platform = videoUrl.includes("instagram") ? "ig" : videoUrl.includes("tiktok") ? "tt" : "yt";
      const nocache = parsedUrl.searchParams.get("nocache") === "1";
      let cachePath = cacheId ? ("/var/www/video-cache/" + platform + "_" + cacheId + ".mp4") : null;
      if (nocache) cachePath = null;

      if (cacheId && cachePath) {
        if (fs.existsSync(cachePath)) {
          const stat = fs.statSync(cachePath);
          const total = stat.size;
          
          if (rangeHeader) {
            const parts = rangeHeader.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : total - 1;
            res.writeHead(206, {
              "Content-Type": "video/mp4",
              "Content-Length": end - start + 1,
              "Content-Range": "bytes " + start + "-" + end + "/" + total,
              "Accept-Ranges": "bytes",
              "Access-Control-Allow-Origin": "*",
              "Cache-Control": "public, max-age=86400",
            });
            fs.createReadStream(cachePath, { start, end }).pipe(res);
          } else {
            res.writeHead(200, {
              "Content-Type": "video/mp4",
              "Content-Length": total,
              "Accept-Ranges": "bytes",
              "Access-Control-Allow-Origin": "*",
              "Cache-Control": "public, max-age=86400",
            });
            fs.createReadStream(cachePath).pipe(res);
          }
          return;
        }
      }

      // ── Check in-memory prefetch cache (pre-resolved CDN URL) ──
      const _prefEntry = prefetchedUrls.get(videoUrl);
      if (_prefEntry && _prefEntry.expiresAt > Date.now()) {
        const _cdnUrl = _prefEntry.cdnUrl;
        console.log("[stream-reel] prefetch hit:", cacheId || videoUrl.slice(-20));
        const _cdnProto = _cdnUrl.startsWith("https") ? require("https") : require("http");
        const _cdnReq = _cdnProto.get(_cdnUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
            ...(rangeHeader ? { "Range": rangeHeader } : {}),
          }
        }, (_cdnRes) => {
          const _h = {
            "Content-Type": _cdnRes.headers["content-type"] || "video/mp4",
            "Accept-Ranges": "bytes",
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "public, max-age=300",
          };
          if (_cdnRes.headers["content-length"]) _h["Content-Length"] = _cdnRes.headers["content-length"];
          if (_cdnRes.headers["content-range"]) _h["Content-Range"] = _cdnRes.headers["content-range"];
          res.writeHead(_cdnRes.statusCode || 200, _h);
          _cdnRes.pipe(res);
        });
        _cdnReq.on("error", () => {
          prefetchedUrls.delete(videoUrl); // clear expired/bad entry
          if (!res.headersSent) { res.writeHead(502); res.end("Prefetch CDN error"); }
        });
        _cdnReq.setTimeout(10000, () => _cdnReq.destroy());
        return;
      }
      // ── End prefetch cache check ──

      // ── Instagram: resolve video URL via IG private API (bypasses Cobalt + yt-dlp) ──
      if (videoUrl.includes("instagram.com") && cacheId) {
        console.log("[stream-reel] IG-API-ENTER cacheId:", cacheId, "url:", videoUrl.slice(0,60));
        try {
          const igAccount = getNextIgCookies();
          if (!igAccount) throw new Error("No IG cookies");
          const { cookieHeader: igCk, csrfToken: igCsrf } = igAccount;
          const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
          let mediaId = BigInt(0);
          for (const ch of cacheId) mediaId = mediaId * BigInt(64) + BigInt(alphabet.indexOf(ch));
          const { execFileSync } = require("child_process");
          const apiResult = execFileSync("curl", [
            "-s", "--max-time", "10",
            "--socks5-hostname", "127.0.0.1:1080",
            "-H", "User-Agent: Instagram 344.0.0.0.98 Android (33/13; 420dpi; 1080x2340; samsung; SM-G991B; o1s; exynos2100)",
            "-H", "X-IG-App-ID: 936619743392459",
            "-H", "X-CSRFToken: " + igCsrf,
            "-H", "Cookie: " + igCk,
            "https://i.instagram.com/api/v1/media/" + mediaId.toString() + "/info/"
          ], { timeout: 15000 });
          const apiData = JSON.parse(apiResult.toString());
          const igCdnUrl = apiData?.items?.[0]?.video_versions?.[0]?.url;
          if (!igCdnUrl) console.log("[stream-reel] IG-API-FAIL", cacheId, "mediaId:", mediaId.toString(), "status:", apiData?.status, "msg:", (apiData?.message || "").slice(0,80));
          if (igCdnUrl) {
            console.log("[stream-reel] IG API resolved:", cacheId, igCdnUrl.slice(0, 80));
            // Cache the CDN URL in prefetchedUrls for 5 min
            prefetchedUrls.set(videoUrl, { cdnUrl: igCdnUrl, expiresAt: Date.now() + 300_000 });
            // Proxy the CDN stream to the client
            const igProto = igCdnUrl.startsWith("https") ? require("https") : require("http");
            const igReq = igProto.get(igCdnUrl, {
              headers: {
                "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
                ...(rangeHeader ? { "Range": rangeHeader } : {}),
              },
            }, (igRes) => {
              const h = {
                "Content-Type": igRes.headers["content-type"] || "video/mp4",
                "Accept-Ranges": "bytes",
                "Access-Control-Allow-Origin": "*",
                "Cache-Control": "public, max-age=300",
              };
              if (igRes.headers["content-length"]) h["Content-Length"] = igRes.headers["content-length"];
              if (igRes.headers["content-range"]) h["Content-Range"] = igRes.headers["content-range"];
              res.writeHead(igRes.statusCode || 200, h);

              // Auto-cache to disk while streaming
              if (cachePath && !rangeHeader) {
                const tmpCache = cachePath + ".tmp-ig-" + Date.now();
                const cacheStream = fs.createWriteStream(tmpCache);
                let cacheOK = true;
                cacheStream.on("error", () => { cacheOK = false; });
                igRes.on("data", (chunk) => { res.write(chunk); if (cacheOK) cacheStream.write(chunk); });
                igRes.on("end", () => {
                  res.end();
                  if (cacheOK) {
                    cacheStream.end();
                    try { fs.renameSync(tmpCache, cachePath); console.log("[stream-reel] IG API cached:", cachePath); } catch(_){}
                  }
                });
              } else {
                igRes.pipe(res);
              }
            });
            igReq.on("error", (e) => {
              console.error("[stream-reel] IG API proxy error:", e.message);
              if (!res.headersSent) { res.writeHead(502); res.end("IG CDN proxy error"); }
            });
            igReq.setTimeout(15000, () => igReq.destroy());
            return;
          }
        } catch (e) {
          console.log("[stream-reel] IG API fallback failed:", e.message?.slice(0, 80));
        }
        // Fall through to Cobalt + yt-dlp
      }

      // Resolve via Cobalt
      const http = require("http");
      const https = require("https");
      const cobaltBody = JSON.stringify({
        url: videoUrl,
        videoQuality: "720",
        filenameStyle: "basic",
        downloadMode: "auto",
      });
      
      const cobaltReq = http.request("http://localhost:9001/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "Content-Length": Buffer.byteLength(cobaltBody),
        },
      }, (cobaltRes) => {
        let data = "";
        cobaltRes.on("data", (c) => { data += c; });
        cobaltRes.on("end", () => {
          try {
            const parsed = JSON.parse(data);
            const cdnUrl = parsed.url;
            if (!cdnUrl) {
              // Cobalt failed — for Instagram try yt-dlp --get-url as fallback
              if (videoUrl.includes("instagram.com")) {
                console.log("[stream-reel] Cobalt failed for IG, trying yt-dlp fallback");
                // Pick best non-stale IG account for yt-dlp
                const igAcctFile = IG_COOKIE_FILES.find(f => !igStaleAccounts.has(f)) || IG_COOKIE_FILES[0];
                let cookieFile = writeIgCookieFile(igAcctFile);
                console.log("[stream-reel] yt-dlp using:", igAcctFile ? igAcctFile.split("/").pop() : "no-cookies");

                const { spawn: spawnYt } = require("child_process");
                const ytArgs = ["--get-url", "-f", "best[ext=mp4]/best", "--no-playlist", "-q"];
                if (cookieFile) ytArgs.push("--cookies", cookieFile);
                ytArgs.push(videoUrl);

                const ytProc = spawnYt("/usr/local/bin/yt-dlp", ytArgs, { timeout: 30000 });
                let ytOut = "", ytErr2 = "";
                ytProc.stdout.on("data", function(d) { ytOut += d.toString(); });
                ytProc.stderr.on("data", function(d) { ytErr2 += d.toString(); });
                ytProc.on("close", function(code) {
                  if (cookieFile) try { fs.unlinkSync(cookieFile); } catch(_) {}
                  const resolvedUrl = ytOut.trim().split("\n")[0];
                  if (code !== 0 || !resolvedUrl) {
                    console.error("[stream-reel] yt-dlp IG fallback failed:", ytErr2.slice(-200));
                    // Mark account stale on any auth/access error
                    const isAuthErr2 = ytErr2.includes("HTTP Error 429") || ytErr2.includes("HTTP Error 500") ||
                        ytErr2.includes("HTTP Error 404") || ytErr2.includes("HTTP Error 400") ||
                        ytErr2.includes("login_required") || ytErr2.includes("login required") ||
                        ytErr2.includes("not granting access") || !resolvedUrl;
                    if (igAcctFile && isAuthErr2) markIgAccountStale(igAcctFile);
                    // Immediately retry with alternate account if one is available
                    const altAcctFile = IG_COOKIE_FILES.find(function(f) { return f !== igAcctFile && !igStaleAccounts.has(f); });
                    if (altAcctFile) {
                      console.log("[stream-reel] yt-dlp retrying with alt account:", altAcctFile.split("/").pop());
                      const altCookie = writeIgCookieFile(altAcctFile);
                      const ytArgs3 = ["--get-url", "-f", "best[ext=mp4]/best", "--no-playlist", "-q"];
                      if (altCookie) ytArgs3.push("--cookies", altCookie);
                      ytArgs3.push(videoUrl);
                      const ytProc3 = spawnYt("/usr/local/bin/yt-dlp", ytArgs3, { timeout: 30000 });
                      let ytOut3 = "", ytErr3 = "";
                      ytProc3.stdout.on("data", function(d) { ytOut3 += d.toString(); });
                      ytProc3.stderr.on("data", function(d) { ytErr3 += d.toString(); });
                      ytProc3.on("close", function(code3) {
                        if (altCookie) try { fs.unlinkSync(altCookie); } catch(_) {}
                        const resolvedUrl3 = ytOut3.trim().split("\n")[0];
                        if (code3 !== 0 || !resolvedUrl3) {
                          console.error("[stream-reel] yt-dlp alt account also failed:", ytErr3.slice(-100));
                          res.writeHead(502); res.end("Could not resolve video"); return;
                        }
                        console.log("[stream-reel] yt-dlp alt OK:", resolvedUrl3.slice(0, 80));
                        const proto3 = resolvedUrl3.startsWith("https") ? https : http;
                        const ph3 = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36", "Referer": "https://www.instagram.com/" };
                        if (rangeHeader) ph3["Range"] = rangeHeader;
                        proto3.get(resolvedUrl3, { headers: ph3 }, function(vidRes3) {
                          const oh3 = { "Content-Type": vidRes3.headers["content-type"] || "video/mp4", "Access-Control-Allow-Origin": "*", "Accept-Ranges": "bytes", "Cache-Control": "no-cache" };
                          if (vidRes3.headers["content-length"]) oh3["Content-Length"] = vidRes3.headers["content-length"];
                          if (vidRes3.headers["content-range"]) oh3["Content-Range"] = vidRes3.headers["content-range"];
                          res.writeHead(vidRes3.statusCode, oh3);
                          if (cacheId && cachePath && !rangeHeader && vidRes3.statusCode === 200) {
                            const tmpP3 = cachePath + ".tmp";
                            const cS3 = fs.createWriteStream(tmpP3);
                            let cOK3 = true;
                            cS3.on("error", function() { cOK3 = false; try { fs.unlinkSync(tmpP3); } catch(_){} });
                            vidRes3.on("data", function(chunk) { res.write(chunk); if (cOK3) cS3.write(chunk); });
                            vidRes3.on("end", function() {
                              res.end();
                              if (cOK3) cS3.end(function() {
                                try { fs.renameSync(tmpP3, cachePath); console.log("[stream-reel] alt-cached:", cachePath); } catch(_){}
                              });
                            });
                            vidRes3.on("error", function() { res.end(); cOK3 = false; try { fs.unlinkSync(tmpP3); } catch(_){} });
                          } else { vidRes3.pipe(res); }
                        }).on("error", function(e3) { res.writeHead(502); res.end("Proxy error: " + e3.message); });
                      });
                      ytProc3.on("error", function() { res.writeHead(502); res.end("yt-dlp spawn error"); });
                      return;
                    }
                    res.writeHead(502); res.end("Could not resolve video"); return;
                  }
                  console.log("[stream-reel] yt-dlp IG fallback OK:", resolvedUrl.slice(0, 80));
                  const proto2 = resolvedUrl.startsWith("https") ? https : http;
                  const ph2 = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36", "Referer": "https://www.instagram.com/" };
                  if (rangeHeader) ph2["Range"] = rangeHeader;
                  proto2.get(resolvedUrl, { headers: ph2 }, function(vidRes2) {
                    const oh2 = {
                      "Content-Type": vidRes2.headers["content-type"] || "video/mp4",
                      "Access-Control-Allow-Origin": "*",
                      "Accept-Ranges": "bytes",
                      "Cache-Control": "no-cache",
                    };
                    if (vidRes2.headers["content-length"]) oh2["Content-Length"] = vidRes2.headers["content-length"];
                    if (vidRes2.headers["content-range"]) oh2["Content-Range"] = vidRes2.headers["content-range"];
                    res.writeHead(vidRes2.statusCode, oh2);
                    if (cacheId && cachePath && !rangeHeader && vidRes2.statusCode === 200) {
                      const tmpP = cachePath + ".tmp";
                      const cS = fs.createWriteStream(tmpP);
                      let cOK = true;
                      cS.on("error", function() { cOK = false; try { fs.unlinkSync(tmpP); } catch(_){} });
                      vidRes2.on("data", function(chunk) { res.write(chunk); if (cOK) cS.write(chunk); });
                      vidRes2.on("end", function() {
                        res.end();
                        if (cOK) cS.end(function() {
                          try { fs.renameSync(tmpP, cachePath); console.log("[stream-reel] yt-dlp auto-cached:", cachePath); } catch(_){}
                        });
                      });
                      vidRes2.on("error", function() { res.end(); cOK = false; try { fs.unlinkSync(tmpP); } catch(_){} });
                    } else {
                      vidRes2.pipe(res);
                    }
                  }).on("error", function(e2) { res.writeHead(502); res.end("Proxy error: " + e2.message); });
                });
                ytProc.on("error", function(e) { res.writeHead(502); res.end("yt-dlp spawn error"); });
                return;
              }
              res.writeHead(502); res.end("Could not resolve video"); return;
            }
            
            // Stream from CDN URL through proxy
            const proto = cdnUrl.startsWith("https") ? https : http;
            const proxyHeaders = {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            };
            if (cdnUrl.includes("instagram")) proxyHeaders["Referer"] = "https://www.instagram.com/";
            if (rangeHeader) proxyHeaders["Range"] = rangeHeader;
            
            proto.get(cdnUrl, { headers: proxyHeaders }, (vidRes) => {
              const outHeaders = {
                "Content-Type": vidRes.headers["content-type"] || "video/mp4",
                "Access-Control-Allow-Origin": "*",
                "Accept-Ranges": "bytes",
                "Cache-Control": "no-cache",
              };
              if (vidRes.headers["content-length"]) outHeaders["Content-Length"] = vidRes.headers["content-length"];
              if (vidRes.headers["content-range"]) outHeaders["Content-Range"] = vidRes.headers["content-range"];
              res.writeHead(vidRes.statusCode, outHeaders);

              // Tee to cache: save full (non-range) responses to disk for instant replay
              if (cacheId && cachePath && !rangeHeader && vidRes.statusCode === 200) {
                const tmpCachePath = cachePath + '.tmp';
                const cacheStream = fs.createWriteStream(tmpCachePath);
                let cacheOK = true;
                cacheStream.on('error', () => { cacheOK = false; try { fs.unlinkSync(tmpCachePath); } catch(_){} });
                vidRes.on('data', (chunk) => { res.write(chunk); if (cacheOK) cacheStream.write(chunk); });
                vidRes.on('end', () => {
                  res.end();
                  if (cacheOK) cacheStream.end(() => {
                    try { fs.renameSync(tmpCachePath, cachePath); console.log('[stream-reel] auto-cached:', cachePath); } catch(_){}
                  });
                });
                vidRes.on('error', () => { res.end(); cacheOK = false; try { fs.unlinkSync(tmpCachePath); } catch(_){} });
              } else {
                vidRes.pipe(res);
              }
            }).on("error", (e) => {
              console.error("[stream-reel] proxy error:", e.message);
              res.writeHead(502); res.end("Proxy error");
            });
          } catch (e) {
            res.writeHead(502); res.end("Parse error");
          }
        });
      });
      
      cobaltReq.on("error", (e) => {
        console.error("[stream-reel] Cobalt error:", e.message);
        res.writeHead(502); res.end("Cobalt error");
      });
      cobaltReq.write(cobaltBody);
      cobaltReq.end();
    } catch (e) {
      console.error("[stream-reel] Error:", e);
      res.writeHead(500); res.end("Server error");
    }
    return;
  }

  // ==================== /proxy-video ====================
  // Proxies Instagram/Facebook CDN video with Range support for <video> seeking
  if (req.method === "GET" && req.url.startsWith("/proxy-video")) {
    try {
      const parsedUrl = new URL("http://localhost" + req.url);
      const videoUrl = parsedUrl.searchParams.get("url");
      if (!videoUrl) { res.writeHead(400); res.end(); return; }
      const https = require("https");
      const httpMod = require("http");
      const proto = videoUrl.startsWith("https") ? https : httpMod;
      const rangeHeader = req.headers["range"];
      const reqHeaders = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": "https://www.instagram.com/"
      };
      if (rangeHeader) reqHeaders["Range"] = rangeHeader;
      proto.get(videoUrl, { headers: reqHeaders }, (vidRes) => {
        const status = vidRes.statusCode;
        const outHeaders = {
          "Content-Type": vidRes.headers["content-type"] || "video/mp4",
          "Access-Control-Allow-Origin": "*",
          "Accept-Ranges": "bytes"
        };
        if (vidRes.headers["content-length"]) outHeaders["Content-Length"] = vidRes.headers["content-length"];
        if (vidRes.headers["content-range"]) outHeaders["Content-Range"] = vidRes.headers["content-range"];
        res.writeHead(status, outHeaders);
        vidRes.pipe(res);
      }).on("error", () => { res.writeHead(502); res.end(); });
    } catch (e) { res.writeHead(500); res.end(); }
    return;
  }

  // Auth check for all POST endpoints
  if (req.method === "POST" && req.headers["x-api-key"] !== API_KEY) {
    res.writeHead(401); res.end(JSON.stringify({ error: "Unauthorized" })); return;
  }

  // ==================== /extract-audio ====================

  // TEST: cobalt proxy with CORS (preview page testing only)
  if (req.method === "POST" && req.url === "/cobalt-proxy") {
    let body = '';
    req.on('data', d => { body += d; });
    req.on('end', async () => {
      try {
        const { url } = JSON.parse(body || '{}');
        if (!url) { res.writeHead(400, corsHeaders); res.end(JSON.stringify({ error: 'url required' })); return; }
        // YouTube: use yt-dlp with cookies (cobalt's youtubei.js is blocked)
        const ytMatch = url.match(/(?:youtube\.com\/(?:shorts\/|watch\?v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
        if (ytMatch) {
          const videoId = ytMatch[1];
          const thumbnail = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
          const id = require('crypto').randomBytes(8).toString('hex');
          const tmpPath = path.join(os.tmpdir(), `yt_${id}.mp4`);
          // Check cache first
          const cachedYT = getCachedVideo(url);
          if (cachedYT) {
            console.log('[cobalt-proxy] YouTube cache HIT:', videoId);
            const cachedYTUrl = VIDEO_CACHE_BASE_URL + '/' + require('path').basename(cachedYT);
            res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'cached', url: cachedYTUrl, thumbnail, videoId }));
            return;
          }
          console.log('[cobalt-proxy] YouTube detected, using yt-dlp with WARP proxy:', videoId);
          try {
            await new Promise((resolve, reject) => {
              const proc = spawn('yt-dlp', [
                '--proxy', 'socks5://127.0.0.1:1080',
                '--no-cache-dir',
                '-f', 'bv*[height<=720]+ba/b[height<=720]',
                '--merge-output-format', 'mp4',
                '-o', tmpPath,
                '--no-playlist',
                '--no-warnings',
                url
              ]);
              let stderr = '';
              proc.stderr.on('data', d => { stderr += d.toString(); });
              proc.on('close', code => {
                if (code === 0 && fs.existsSync(tmpPath) && fs.statSync(tmpPath).size > 10000) resolve();
                else reject(new Error(`yt-dlp exit ${code}: ${stderr.slice(-300)}`));
              });
              setTimeout(() => { try { proc.kill(); } catch(_){} reject(new Error('yt-dlp timeout')); }, 120000);
            });
            const stat = fs.statSync(tmpPath);
            const cachedUrl = cacheVideo(url, tmpPath);
            try { fs.unlinkSync(tmpPath); } catch(_) {}
            console.log('[cobalt-proxy] YouTube video cached:', cachedUrl, 'size:', stat.size);
            res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'cached', url: cachedUrl, thumbnail, videoId, size: stat.size }));
          } catch (e) {
            console.log('[cobalt-proxy] yt-dlp failed:', e.message);
            // Fallback to embed if download fails
            const embedUrl = `https://www.youtube.com/embed/${videoId}?autoplay=1`;
            res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'youtube', videoId, thumbnail, embedUrl, warning: 'download failed, embed fallback' }));
          }
          return;
        }
        const r = await fetch('http://localhost:9001/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({ url })
        });
        const data = await r.json();
        // tunnel/stream/redirect = VPS must download first and return a stable cached URL
        // redirect = Instagram CDN URL (expires in seconds — must cache immediately)
        if ((data.status === 'tunnel' || data.status === 'stream' || data.status === 'redirect') && data.url) {
          const id = require('crypto').randomBytes(8).toString('hex');
          const tmpPath = require('path').join(require('os').tmpdir(), `cobalt_${id}.mp4`);
          await downloadFile(data.url, tmpPath);
          const stat = require('fs').statSync(tmpPath);
          if (stat.size < 10000) { require('fs').unlinkSync(tmpPath); throw new Error('Download too small'); }
          const cachedUrl = cacheVideo(url, tmpPath);
          try { require('fs').unlinkSync(tmpPath); } catch(_) {}
          res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'cached', url: cachedUrl, filename: data.filename, size: stat.size }));
        } else {
          res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
          res.end(JSON.stringify(data));
        }
      } catch (e) {
        res.writeHead(500, corsHeaders); res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // TEST: Instagram thumbnail via Puppeteer (preview page testing only)
  if (req.method === "POST" && req.url === "/ig-thumbnail") {
    let body = '';
    req.on('data', d => { body += d; });
    req.on('end', async () => {
      try {
        const { url } = JSON.parse(body || '{}');
        if (!url) { res.writeHead(400, corsHeaders); res.end(JSON.stringify({ error: 'url required' })); return; }
        const puppeteer = require('/var/www/node_modules/puppeteer');
        let browser;
        let thumbnailUrl = null;
        try {
          browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu']
          });
          const page = await browser.newPage();
          await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1');
          page.on('response', (response) => {
            if (thumbnailUrl) return;
            const u = response.url();
            if (u.includes('cdninstagram.com') && (u.includes('/t51.') || u.includes('/t51_')) && (u.includes('.jpg') || u.includes('_n.jpg'))) {
              thumbnailUrl = u;
              console.log('[ig-thumbnail] Captured:', u.slice(0, 80));
            }
          });
          try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
          } catch (e) { console.log('[ig-thumbnail] nav partial:', e.message.slice(0,50)); }
          await new Promise(r => setTimeout(r, 3000));
          if (!thumbnailUrl) {
            thumbnailUrl = await page.evaluate(() => {
              const m = document.querySelector('meta[property="og:image"]');
              return m ? m.getAttribute('content') : null;
            });
          }
        } finally {
          if (browser) { try { await browser.close(); } catch(_){} }
        }
        res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ thumbnail_url: thumbnailUrl }));
      } catch (e) {
        res.writeHead(500, corsHeaders); res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  if (req.method === "POST" && req.url === "/extract-audio") {
    let body;
    try { body = await parseBody(req); }
    catch (e) { res.writeHead(400); res.end(JSON.stringify({ error: "Invalid JSON" })); return; }

    const url = body.url;
    const originalUrl = body.original_url || url;
    if (!url) { res.writeHead(400); res.end(JSON.stringify({ error: "url is required" })); return; }

    const tmpDir = os.tmpdir();
    const id = randomBytes(8).toString("hex");
    const outTemplate = path.join(tmpDir, `audio_${id}.%(ext)s`);
    const mp3Path = path.join(tmpDir, `audio_${id}.mp3`);
    let videoCacheUrl = null;

    console.log("Extracting audio from:", url);
    const isInstagram = url.includes("instagram.com");
    // Caller (the analyzer) already downloaded the video via Cobalt/mobile-API and
    // passes its stable URL here — extract audio straight from it with ffmpeg, no
    // Instagram round-trip and no yt-dlp. This is the reliable path; yt-dlp's IG
    // extractor breaks whenever Instagram changes their API.
    const directMediaUrl = body.direct_media_url || null;
    // Detect direct CDN media URLs — use ffmpeg directly, skip cobalt/yt-dlp
    const isDirectCDN = /fbcdn\.net|cdninstagram\.com|akamaized\.net|instagram\.f[a-z0-9]+-[0-9]+\.fna|tiktokcdn\.com|googlevideo\.com/.test(url);

    try {
      if (directMediaUrl) {
        console.log("direct_media_url provided — ffmpeg audio from downloaded file, skipping IG resolution");
        const tmpVideo = path.join(tmpDir, `direct_${id}.mp4`);
        try {
          await downloadFile(directMediaUrl, tmpVideo);
          const stat = fs.statSync(tmpVideo);
          console.log("Direct media downloaded:", stat.size, "bytes");
          if (stat.size < 5000) throw new Error(`direct media too small (${stat.size}b) — likely expired`);
          await convertToMp3(tmpVideo, mp3Path);
        } finally {
          try { fs.unlinkSync(tmpVideo); } catch (_) {}
        }
      } else if (isDirectCDN) {
        console.log("Direct CDN URL — using ffmpeg to extract audio");
        const tmpVideo = path.join(tmpDir, `cdndl_${id}.mp4`);
        let cdnSuccess = false;
        try {
          await downloadFile(url, tmpVideo);
          const stat = fs.statSync(tmpVideo);
          console.log("CDN video downloaded:", stat.size, "bytes");
          if (stat.size < 5000) {
            console.log("CDN download too small ("+stat.size+"b), likely expired");
          } else {
            videoCacheUrl = cacheVideo(originalUrl, tmpVideo);
            await convertToMp3(tmpVideo, mp3Path);
            cdnSuccess = true;
          }
        } catch (cdnErr) {
          console.log("CDN direct download/convert failed:", cdnErr.message);
        } finally {
          try { fs.unlinkSync(tmpVideo); } catch(_) {}
        }
        // Fallback: try cobalt with original page URL if CDN failed
        if (!cdnSuccess) {
          console.log("CDN failed — falling back to cobalt with original URL:", originalUrl);
          let usedCobaltFallback = false;
          try {
            await extractWithCobalt(originalUrl, mp3Path, originalUrl);
            usedCobaltFallback = true;
            console.log("Cobalt CDN-fallback succeeded!");
          } catch (cobaltErr) {
            console.log("Cobalt CDN-fallback failed:", cobaltErr.message, "— trying yt-dlp");
          }
          if (!usedCobaltFallback) {
            await extractWithYtDlp(originalUrl, outTemplate);
          }
        }
      } else {
        const isFacebook = url.includes("facebook.com") || url.includes("fb.watch");

        if (isFacebook) {
          console.log('[FB] Starting Puppeteer browser extraction...');
          const { audioUrl: fbAudioUrl, videoUrl: fbVideoUrl } = await extractFacebookAudioWithBrowser(url);
          const fbAudioRaw = path.join(tmpDir, `fbaudio_${id}.m4a`);
          const fbVideoRaw = fbVideoUrl ? path.join(tmpDir, `fbvideo_${id}.mp4`) : null;

          // Download audio + video in parallel
          const dlTasks = [downloadFile(fbAudioUrl, fbAudioRaw)];
          if (fbVideoUrl && fbVideoRaw) dlTasks.push(downloadFile(fbVideoUrl, fbVideoRaw));
          await Promise.all(dlTasks);

          const fbAudioStat = fs.statSync(fbAudioRaw);
          console.log('[FB] Downloaded audio:', fbAudioStat.size, 'bytes');
          if (fbAudioStat.size < 1000) {
            try { fs.unlinkSync(fbAudioRaw); } catch (_) {}
            throw new Error('Facebook audio download too small — URL may have expired');
          }

          // Merge audio + video, cache for playback/thumbnail
          if (fbVideoRaw && fs.existsSync(fbVideoRaw) && fs.statSync(fbVideoRaw).size > 10000) {
            const fbMerged = path.join(tmpDir, `fbmerged_${id}.mp4`);
            try {
              await mergeAudioVideo(fbVideoRaw, fbAudioRaw, fbMerged);
              videoCacheUrl = cacheVideo(originalUrl, fbMerged);
              console.log('[FB] Merged video cached:', videoCacheUrl);
              try { fs.unlinkSync(fbMerged); } catch (_) {}
            } catch (mergeErr) {
              console.log('[FB] Merge failed:', mergeErr.message, '— caching video-only');
              videoCacheUrl = cacheVideo(originalUrl, fbVideoRaw);
            }
            try { fs.unlinkSync(fbVideoRaw); } catch (_) {}
          }

          await convertToMp3(fbAudioRaw, mp3Path);
          try { fs.unlinkSync(fbAudioRaw); } catch (_) {}
        } else {
          // Try cobalt first for page URLs (YouTube, TikTok, Instagram)
          let usedCobalt = false;
          try {
            console.log("Trying cobalt.tools first...");
            await extractWithCobalt(url, mp3Path, originalUrl);
            usedCobalt = true;
            console.log("Cobalt succeeded!");
          } catch (cobaltErr) {
            console.log("Cobalt failed:", cobaltErr.message, "— falling back to yt-dlp");
          }
          if (!usedCobalt) {
            await extractWithYtDlp(url, outTemplate);
          }
        }
      }

      // Check if cobalt cached the video (extractWithCobalt caches internally)
      if (!videoCacheUrl) {
        const cached = getCachedVideo(originalUrl);
        if (cached) videoCacheUrl = `${VIDEO_CACHE_BASE_URL}/${path.basename(cached)}`;
      }

      const finalPath = fs.existsSync(mp3Path) ? mp3Path : outTemplate.replace("%(ext)s", "mp3");
      if (!fs.existsSync(finalPath)) {
        res.writeHead(500); res.end(JSON.stringify({ error: "Output file not found" })); return;
      }

      const stat = fs.statSync(finalPath);
      console.log("Audio file size:", stat.size, "bytes");

      const respHeaders = {
        "Content-Type": "audio/mpeg",
        "Content-Length": stat.size,
        "X-Filename": "audio.mp3",
      };
      if (videoCacheUrl) respHeaders["X-Video-Cache"] = videoCacheUrl;
      res.writeHead(200, respHeaders);

      const readStream = fs.createReadStream(finalPath);
      readStream.pipe(res);
      readStream.on("end", () => {
        try { fs.unlinkSync(finalPath); } catch (_) {}
      });
    } catch (err) {
      console.error("Extraction failed:", err.message);
      if (!res.headersSent) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: err.message }));
      }
    }
    return;
  }

  // ==================== /analyze-video ====================
  // Returns: { duration_seconds, frames: [{timestamp, base64, content_type}], audio: {mean_volume_db, max_volume_db} }
  if (req.method === "POST" && req.url === "/analyze-video") {
    let body;
    try { body = await parseBody(req); }
    catch (e) { res.writeHead(400); res.end(JSON.stringify({ error: "Invalid JSON" })); return; }

    const { url, interval_seconds = 1, max_frames = 20, original_url } = body;
    if (!url) { res.writeHead(400); res.end(JSON.stringify({ error: "url is required" })); return; }

    const tmpDir = os.tmpdir();
    const id = randomBytes(8).toString("hex");
    let videoPath = path.join(tmpDir, `video_${id}.mp4`);
    const framesDir = path.join(tmpDir, `frames_${id}`);
    let usedCache = false;

    console.log("Analyzing video:", url);
    const isInstagram = url.includes("instagram.com");

    try {
      // Check video cache first (keyed by original_url or url)
      const cachedPath = getCachedVideo(original_url || url);
      if (cachedPath) {
        console.log("Using cached video for analysis");
        videoPath = cachedPath;
        usedCache = true;
      } else {
        // Download video
        // Detect direct CDN URLs — use simple download, skip cobalt/yt-dlp
        const isDirectCDN = /fbcdn\.net|cdninstagram\.com|akamaized\.net|instagram\.f[a-z0-9]+-[0-9]+\.fna|tiktokcdn\.com|googlevideo\.com|connectacreators\.com\/video-cache/.test(url);
        if (isDirectCDN) {
          console.log("Direct CDN URL — downloading directly for analysis");
          await downloadFile(url, videoPath);
        } else {
          // Try cobalt first for page URLs
          let videoDownloaded = false;
          try {
            console.log("Trying cobalt for video download...");
            await downloadInstagramVideo(url, videoPath);
            videoDownloaded = true;
            console.log("Cobalt video download succeeded!");
          } catch (cobaltErr) {
            console.log("Cobalt video download failed:", cobaltErr.message, "— trying yt-dlp");
          }
          if (!videoDownloaded) {
            console.log("Using yt-dlp for video download...");
            await downloadVideoWithYtDlp(url, videoPath);
          }
        }

        // Cache the downloaded video for future requests
        if (fs.existsSync(videoPath) && fs.statSync(videoPath).size > 1000) {
          cacheVideo(original_url || url, videoPath);
        }
      }

      if (!fs.existsSync(videoPath) || fs.statSync(videoPath).size < 1000) {
        throw new Error("Video download failed or file too small");
      }

      // Get duration + extract frames + get volume stats in parallel
      fs.mkdirSync(framesDir, { recursive: true });

      const [durationSeconds, , volumeStats] = await Promise.all([
        getVideoDuration(videoPath),
        extractFrames(videoPath, framesDir, interval_seconds, max_frames),
        getVolumeStats(videoPath)
      ]);

      // Read frames as base64
      const frames = readFramesAsBase64(framesDir, durationSeconds, interval_seconds);
      console.log(`Extracted ${frames.length} frames, duration: ${durationSeconds}s`);

      const result = {
        duration_seconds: durationSeconds,
        frames,
        audio: volumeStats
      };

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result));
    } catch (err) {
      console.error("Video analysis failed:", err.message);
      if (!res.headersSent) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: err.message }));
      }
    } finally {
      // Cleanup — don't delete cached video files
      if (!usedCache) { try { fs.unlinkSync(videoPath); } catch (_) {} }
      try { fs.rmSync(framesDir, { recursive: true, force: true }); } catch (_) {}
    }
    return;
  }


  // ─── GET THUMBNAIL (Instagram via cobalt+ffmpeg, others via yt-dlp) ───
  if (req.method === "POST" && req.url === "/get-thumbnail") {
    let body;
    try {
      const raw = await new Promise((resolve, reject) => {
        let data = ""; req.on("data", c => data += c); req.on("end", () => resolve(data)); req.on("error", reject);
      });
      body = JSON.parse(raw);
    } catch (e) { res.writeHead(400); res.end(JSON.stringify({ error: "Invalid JSON" })); return; }

    const { url } = body;
    if (!url) { res.writeHead(400); res.end(JSON.stringify({ error: "url is required" })); return; }

    console.log("Getting thumbnail for:", url);
    const { spawn } = require("child_process");
    const id = randomBytes(8).toString("hex");

    try {
      let thumbBase64 = null;

      // For Instagram: use cobalt to get video URL, then ffmpeg first frame
      if (url.includes("instagram.com")) {
        console.log("Instagram detected — using cobalt + ffmpeg");

        // Step 1: Get video download URL from cobalt
        const cobaltResult = await new Promise((resolve, reject) => {
          const payload = JSON.stringify({ url });
          const options = {
            hostname: "localhost", port: 9001, path: "/", method: "POST",
            headers: { "Content-Type": "application/json", "Accept": "application/json", "Content-Length": Buffer.byteLength(payload) }
          };
          const req = require("http").request(options, (res) => {
            let body = ""; res.on("data", d => body += d); res.on("end", () => {
              try { resolve(JSON.parse(body)); } catch(e) { reject(new Error("Cobalt parse error")); }
            });
          });
          req.on("error", reject);
          req.write(payload); req.end();
          setTimeout(() => reject(new Error("Cobalt timeout")), 10000);
        });

        console.log("Cobalt response:", JSON.stringify(cobaltResult).slice(0, 200));

        const videoUrl = cobaltResult.url || (cobaltResult.audio ? null : null);
        if (!videoUrl) throw new Error("Cobalt returned no video URL");

        // Step 2: Use ffmpeg to grab first frame directly from URL (no full download needed)
        const framePath = path.join(os.tmpdir(), `thumb_${id}.jpg`);
        await new Promise((resolve, reject) => {
          const proc = spawn("ffmpeg", [
            "-y", "-i", videoUrl,
            "-vframes", "1", "-q:v", "3",
            "-vf", "scale=640:-1",
            framePath
          ]);
          let stderr = "";
          proc.stderr.on("data", d => stderr += d.toString());
          proc.on("close", code => {
            if (code === 0 && fs.existsSync(framePath)) resolve();
            else reject(new Error("ffmpeg failed: " + stderr.slice(-200)));
          });
          setTimeout(() => { try { proc.kill(); } catch(_){} reject(new Error("ffmpeg timeout")); }, 15000);
        });

        // Step 3: Read frame and convert to base64
        const frameData = fs.readFileSync(framePath);
        thumbBase64 = `data:image/jpeg;base64,${frameData.toString("base64")}`;
        console.log("Instagram thumbnail extracted, base64 size:", thumbBase64.length);
        try { fs.unlinkSync(framePath); } catch(_) {}
      }

      // For Facebook: extract frame from cached video
      if (!thumbBase64 && (url.includes("facebook.com") || url.includes("fb.watch"))) {
        const cachedPath = getCachedVideo(url);
        if (cachedPath) {
          console.log("[Thumb] Facebook cached video found — extracting frame");
          const framePath = path.join(os.tmpdir(), `thumb_${id}.jpg`);
          try {
            await new Promise((resolve, reject) => {
              const proc = spawn("/usr/bin/ffmpeg", [
                "-y", "-ss", "2",
                "-i", cachedPath,
                "-vframes", "1", "-q:v", "3",
                "-vf", "scale=640:-1",
                framePath
              ]);
              let stderr = "";
              proc.stderr.on("data", (d) => { stderr += d.toString(); });
              proc.on("close", (code) => {
                if (code === 0 && fs.existsSync(framePath)) resolve();
                else reject(new Error("ffmpeg: " + stderr.slice(-150)));
              });
              setTimeout(() => { try { proc.kill(); } catch(_){} reject(new Error("ffmpeg timeout")); }, 15000);
            });
            const frameData = fs.readFileSync(framePath);
            thumbBase64 = `data:image/jpeg;base64,${frameData.toString("base64")}`;
            console.log("[Thumb] Facebook frame extracted, size:", thumbBase64.length);
            try { fs.unlinkSync(framePath); } catch(_) {}
          } catch (frameErr) {
            console.log("[Thumb] Facebook frame extraction failed:", frameErr.message);
          }
        } else {
          console.log("[Thumb] Facebook: no cached video yet for", url);
        }
      }

      if (thumbBase64) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ thumbnail_url: thumbBase64 }));
      } else {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ thumbnail_url: null, error: "No thumbnail extracted" }));
      }
    } catch (err) {
      console.error("Thumbnail extraction failed:", err.message);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }


  // ==================== /resolve-video-url ====================
  // Fast: resolves social URL → CDN URL via Cobalt (no download, ~1s)
  if (req.method === "POST" && req.url === "/resolve-video-url") {
    let body;
    try { body = await parseBody(req); }
    catch (e) { res.writeHead(400); res.end(JSON.stringify({ error: "Invalid JSON" })); return; }

    const { url } = body;
    if (!url) { res.writeHead(400); res.end(JSON.stringify({ error: "url required" })); return; }

    // Check video cache first — instant hit
    const cached = getCachedVideo(url);
    if (cached) {
      const cachedUrl = VIDEO_CACHE_BASE_URL + '/' + require('path').basename(cached);
      console.log("[resolve] Cache HIT:", cachedUrl);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ cdn_url: cachedUrl, cached: true }));
      return;
    }

    try {
      console.log("[resolve] Resolving:", url.slice(0, 80));
      const cobaltData = await getCobaltVideoUrl(url);
      if (!cobaltData.url || !["stream", "tunnel", "redirect"].includes(cobaltData.status)) {
        throw new Error("Cobalt: " + (cobaltData.status || "no url"));
      }
      console.log("[resolve] Got CDN URL, status:", cobaltData.status);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ cdn_url: cobaltData.url, cached: false }));
    } catch (e) {
      console.error("[resolve] Error:", e.message);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // ==================== /download-video ====================
  // Downloads video MP4 and serves it from public dir
  if (req.method === "POST" && req.url === "/download-video") {
    let body;
    try { body = await parseBody(req); }
    catch (e) { res.writeHead(400); res.end(JSON.stringify({ error: "Invalid JSON" })); return; }

    const { url } = body;
    if (!url) { res.writeHead(400); res.end(JSON.stringify({ error: "url is required" })); return; }

    const videosDir = "/var/www/connectacreators/videos";
    if (!fs.existsSync(videosDir)) fs.mkdirSync(videosDir, { recursive: true });

    // Cleanup: delete videos older than 24h
    try {
      const now = Date.now();
      const files = fs.readdirSync(videosDir);
      for (const f of files) {
        const fp = path.join(videosDir, f);
        const stat = fs.statSync(fp);
        if (now - stat.mtimeMs > 24 * 60 * 60 * 1000) {
          fs.unlinkSync(fp);
          console.log("Cleaned up old video:", f);
        }
      }
    } catch (_) {}

    // Size cap: if folder exceeds 1.5GB, evict oldest until under 1GB
    try {
      const MAX_BYTES = 1.5 * 1024 * 1024 * 1024;
      const TARGET_BYTES = 1.0 * 1024 * 1024 * 1024;
      const allFiles = fs.readdirSync(videosDir).map(f => {
        const fp = path.join(videosDir, f);
        const st = fs.statSync(fp);
        return { fp, size: st.size, mtime: st.mtimeMs };
      }).sort((a, b) => a.mtime - b.mtime);
      const totalSize = allFiles.reduce((s, f) => s + f.size, 0);
      if (totalSize > MAX_BYTES) {
        let freed = 0;
        for (const f of allFiles) {
          if (totalSize - freed <= TARGET_BYTES) break;
          try { fs.unlinkSync(f.fp); freed += f.size; console.log("Size evict:", f.fp); } catch(_) {}
        }
      }
    } catch(_) {}

    const hash = randomBytes(12).toString("hex");
    const videoPath = path.join(videosDir, `${hash}.mp4`);

    console.log("Downloading video for playback:", url);

    try {
      // Try cobalt first (works well for Instagram)
      let downloaded = false;
      try {
        console.log("Trying cobalt for video download...");
        await downloadInstagramVideo(url, videoPath);
        downloaded = true;
        console.log("Cobalt video download succeeded!");
      } catch (cobaltErr) {
        console.log("Cobalt failed:", cobaltErr.message, "— trying yt-dlp");
      }
      if (!downloaded) {
        await downloadVideoWithYtDlp(url, videoPath);
      }

      if (!fs.existsSync(videoPath) || fs.statSync(videoPath).size < 1000) {
        throw new Error("Video download failed or file too small");
      }

      const videoUrl = `https://connectacreators.com/videos/${hash}.mp4`;
      console.log("Video available at:", videoUrl);

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ video_url: videoUrl }));
    } catch (err) {
      console.error("Video download failed:", err.message);
      // Clean up failed file
      try { fs.unlinkSync(videoPath); } catch (_) {}
      if (!res.headersSent) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: err.message }));
      }
    }
    return;
  }
  // ==================== /cache-thumbnail ====================
  // Downloads a CDN thumbnail to local disk for permanent serving
  if (req.method === "POST" && req.url === "/cache-thumbnail") {
    let body;
    try { body = await parseBody(req); }
    catch (e) { res.writeHead(400); res.end(JSON.stringify({ error: "Invalid JSON" })); return; }

    const { url, key } = body;
    if (!url || !key) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: "url and key are required" }));
      return;
    }

    // Sanitize key to prevent path traversal
    const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, "_");
    const thumbDir = "/var/www/thumb-cache";
    const thumbPath = path.join(thumbDir, safeKey + ".jpg");
    const thumbUrl = "https://connectacreators.com/thumb-cache/" + safeKey + ".jpg";

    // Already cached?
    if (fs.existsSync(thumbPath) && fs.statSync(thumbPath).size > 500) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ cached_url: thumbUrl }));
      return;
    }

    try {
      // Download the CDN image with redirect support
      const downloadThumb = (dlUrl, dest, redirects) => {
        if (redirects === undefined) redirects = 5;
        return new Promise((resolve, reject) => {
          if (redirects <= 0) return reject(new Error("Too many redirects"));
          const p = dlUrl.startsWith("https") ? require("https") : require("http");
          const r = p.get(dlUrl, {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
              "Referer": "https://www.instagram.com/"
            }
          }, (response) => {
            if (response.statusCode === 301 || response.statusCode === 302) {
              return downloadThumb(response.headers.location, dest, redirects - 1).then(resolve).catch(reject);
            }
            if (response.statusCode !== 200) {
              return reject(new Error("HTTP " + response.statusCode));
            }
            const file = fs.createWriteStream(dest);
            response.pipe(file);
            file.on("finish", () => { file.close(); resolve(); });
            file.on("error", reject);
          });
          r.on("error", reject);
          r.setTimeout(15000, () => { r.destroy(); reject(new Error("Timeout")); });
        });
      };

      await downloadThumb(url, thumbPath);

      // Verify file is valid
      if (!fs.existsSync(thumbPath) || fs.statSync(thumbPath).size < 500) {
        try { fs.unlinkSync(thumbPath); } catch (_) {}
        res.writeHead(502);
        res.end(JSON.stringify({ error: "Downloaded file too small or corrupt" }));
        return;
      }

      console.log("Cached thumbnail:", safeKey, fs.statSync(thumbPath).size, "bytes");
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ cached_url: thumbUrl }));
    } catch (err) {
      console.error("Thumbnail cache error:", err.message);
      try { fs.unlinkSync(thumbPath); } catch (_) {}
      res.writeHead(502);
      res.end(JSON.stringify({ error: "Failed to download thumbnail: " + err.message }));
    }
    return;
  }

  // ==================== PROFILE SCRAPING (replaces Apify) ====================
  if (req.method === "POST" && req.url === "/scrape-profile") {
    if (req.headers["x-api-key"] !== API_KEY) {
      res.writeHead(401, { ...corsHeaders, "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", async () => {
      try {
        const { platform, username, limit = 20 } = JSON.parse(body);
        if (!platform || !username) {
          res.writeHead(400, { ...corsHeaders, "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "platform and username are required" }));
          return;
        }

        console.log(`[scrape-profile] ${platform} @${username} limit=${limit}`);
        let result;

        if (platform === "instagram") {
          result = await scrapeInstagramProfile(username, limit);
        } else if (platform === "tiktok") {
          result = await scrapeTikTokProfile(username, limit);
        } else if (platform === "youtube") {
          result = await scrapeYouTubeProfile(username, limit);
        } else if (platform === "facebook") {
          result = await scrapeFacebookProfile(username, limit);
        } else {
          res.writeHead(400, { ...corsHeaders, "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Unsupported platform: " + platform }));
          return;
        }

        // Normalize result: Instagram returns {posts, profilePicUrl}, TikTok/YouTube return object
        let normalized = result;
        const mapIgPost = (p) => ({
          id: p.shortcode || p.id,
          title: (p.caption || p.title || "").slice(0, 600),
          views: p.views || 0,
          likes: p.likes || 0,
          comments: p.comments || 0,
          engagement_rate: p.views > 0 ? +((p.likes + p.comments) / p.views * 100).toFixed(2) : 0,
          thumbnail: p.thumbnail_url || p.thumbnail || null,
          posted_at: p.timestamp ? new Date(p.timestamp * 1000).toISOString().slice(0, 10) : (p.posted_at || null),
          url: p.video_url || p.url || "",
          duration: null,
        });
        const cleanUser = username.replace(/^@/, "").replace(/.*instagram\.com\//, "").replace(/\/.*/, "");
        if (Array.isArray(result)) {
          normalized = {
            posts: result.map(mapIgPost),
            username: cleanUser, platform,
            profilePicUrl: null, followers: null,
            totalPosts: result.length,
          };
        } else if (platform === "instagram" && result.posts && result.posts[0]?.shortcode) {
          normalized = {
            posts: result.posts.map(mapIgPost),
            username: cleanUser, platform,
            profilePicUrl: result.profilePicUrl || null,
            followers: result.followers || null,
            totalPosts: result.posts.length,
          };
        }
        console.log(`[scrape-profile] ${platform} @${username}: ${normalized.posts?.length || normalized.totalPosts || 0} posts found`);
        res.writeHead(200, { ...corsHeaders, "Content-Type": "application/json" });
        res.end(JSON.stringify(normalized));
      } catch (e) {
        console.error("[scrape-profile] Error:", e.message);
        res.writeHead(500, { ...corsHeaders, "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }


  // ── /ig-search — keyword → Instagram accounts (lead prospecting) ────────────
  if (req.method === "POST" && req.url === "/ig-search") {
    if (req.headers["x-api-key"] !== API_KEY) {
      res.writeHead(401, corsHeaders);
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      try {
        const { query, limit = 15 } = JSON.parse(body || "{}");
        if (!query || typeof query !== "string" || !query.trim()) {
          res.writeHead(400, corsHeaders);
          res.end(JSON.stringify({ error: "query is required" }));
          return;
        }
        const safeLim = Math.max(1, Math.min(Number(limit) || 15, 30));
        const session = getNextIgCookies();
        if (!session) {
          res.writeHead(503, corsHeaders);
          res.end(JSON.stringify({ error: "No IG cookie files available", code: "NO_IG_SESSIONS" }));
          return;
        }
        console.log("[ig-search] query:", JSON.stringify(query.trim()), "limit:", safeLim);
        // One retry across the rotation on a real auth failure: the failing
        // account is already marked stale by igAuthedFetch, so the retry lands
        // on a different session. Without this, the first search after a
        // session dies returns SESSION_EXPIRED to the operator even though a
        // healthy account was sitting right behind it in rotation.
        let r = igTopSearch(query.trim(), safeLim, session);
        if (!r.ok && r.reason === "auth") {
          const alt = getNextIgCookies();
          if (alt && alt.file !== session.file) {
            console.warn("[ig-search] retrying with", (alt.file || "").split("/").pop());
            r = igTopSearch(query.trim(), safeLim, alt);
          }
        }
        if (!r.ok) {
          res.writeHead(503, corsHeaders);
          res.end(JSON.stringify({
            error: "Instagram search unavailable (" + r.reason + ")",
            code: r.reason === "auth" ? "SESSION_EXPIRED" : "IG_UNAVAILABLE",
          }));
          return;
        }
        console.log("[ig-search] returned", r.users.length, "accounts");
        res.writeHead(200, corsHeaders);
        res.end(JSON.stringify({ users: r.users }));
      } catch (e) {
        console.error("[ig-search] Error:", e.message);
        res.writeHead(500, corsHeaders);
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // ── /ig-profile-info — batch profile enrichment for lead qualification ──────
  if (req.method === "POST" && req.url === "/ig-profile-info") {
    if (req.headers["x-api-key"] !== API_KEY) {
      res.writeHead(401, corsHeaders);
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", async () => {
      try {
        const { usernames } = JSON.parse(body || "{}");
        if (!Array.isArray(usernames) || usernames.length === 0) {
          res.writeHead(400, corsHeaders);
          res.end(JSON.stringify({ error: "usernames array is required" }));
          return;
        }
        const list = usernames
          .slice(0, 10)
          .map((u) => String(u || "").replace(/^@/, "").trim())
          .filter(Boolean);

        const profiles = {};
        let authFailures = 0;
        let sessionsExhausted = false;

        for (let i = 0; i < list.length; i++) {
          // Pace the batch: ~4-6s between profiles. The cookie pool is the
          // fragile resource here (all 6 accounts 2FA-locked at once on
          // 2026-07-27), so this stays well under Viral Today's own load.
          if (i > 0) {
            await new Promise((r) => setTimeout(r, 4000 + Math.floor(Math.random() * 2000)));
          }
          const session = getNextIgCookies();
          if (!session) { sessionsExhausted = true; break; }

          const name = list[i];
          // usernameinfo/ is throttled per acting account (ds_user_id) — see
          // stripDsUserId above. Stripped only for this call site, not inside
          // igAuthedFetch itself, so /ig-search's topsearch_flat call (which
          // needs the full authenticated jar) is untouched.
          const r = igAuthedFetch(
            "https://i.instagram.com/api/v1/users/" + encodeURIComponent(name) + "/usernameinfo/",
            { ...session, cookieHeader: stripDsUserId(session.cookieHeader) }
          );

          if (!r.ok) {
            if (r.reason === "auth") {
              // getNextIgCookies() never returns null from staleness -- it
              // clears the stale set and retries -- so exhaustion is detected
              // by consecutive auth failures instead. Two in a row means the
              // pool is down, not that one account rotated badly.
              authFailures++;
              if (authFailures >= 2) { sessionsExhausted = true; break; }
            }
            profiles[name] = { error: r.reason };
            continue;
          }
          authFailures = 0;

          const u = r.data && r.data.user;
          if (!u) { profiles[name] = { error: "not_found" }; continue; }

          // null means "Instagram did not tell us", NOT "zero"/"empty". The
          // previous `|| 0` / `|| ""` coalescing made a field IG omitted
          // indistinguishable from a real 0, so an enrichment reply missing
          // follower_count overwrote the good number /ig-search already
          // captured with 0. The writer skips nulls for those columns.
          const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
          const str = (v) => (typeof v === "string" && v !== "" ? v : null);
          const id = u.pk != null ? String(u.pk) : u.pk_id != null ? String(u.pk_id) : null;

          profiles[name] = {
            ig_user_id: str(id),
            full_name: str(u.full_name),
            biography: str(u.biography),
            external_url: str(u.external_url),
            category: str(u.category),
            is_business: typeof u.is_business === "boolean" ? u.is_business : null,
            media_count: num(u.media_count),
            follower_count: num(u.follower_count),
            following_count: num(u.following_count),
            public_email: str(u.public_email),
            public_phone: str(u.public_phone_number),
            city_name: str(u.city_name),
            is_private: typeof u.is_private === "boolean" ? u.is_private : null,
            is_verified: typeof u.is_verified === "boolean" ? u.is_verified : null,
          };
        }

        const gotAny = Object.keys(profiles).some((k) => !profiles[k].error);
        if (sessionsExhausted && !gotAny) {
          res.writeHead(503, corsHeaders);
          res.end(JSON.stringify({
            error: "Instagram sessions exhausted",
            code: "SESSION_EXPIRED",
            profiles: {},
            sessionsExhausted: true,
          }));
          return;
        }
        console.log("[ig-profile-info] enriched", Object.keys(profiles).length, "of", list.length,
          sessionsExhausted ? "(sessions exhausted mid-batch)" : "");
        res.writeHead(200, corsHeaders);
        res.end(JSON.stringify({ profiles, sessionsExhausted }));
      } catch (e) {
        console.error("[ig-profile-info] Error:", e.message);
        res.writeHead(500, corsHeaders);
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // ── /scrape-reels-search — keyword search for Instagram Reels ───────────────
  if (req.method === "POST" && req.url === "/scrape-reels-search") {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", async () => {
      try {
        const { query, limit = 150 } = JSON.parse(body);
        if (!query || typeof query !== "string") {
          res.writeHead(400, { ...corsHeaders, "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "query is required" }));
          return;
        }

        const safeLim = Math.min(limit, 500);
        console.log("[reels-search] Query:", JSON.stringify(query), "limit:", safeLim);

        // Load session cookies (with account rotation)
        const igAccount = getNextIgCookies();
        if (!igAccount) {
          res.writeHead(500, { ...corsHeaders, "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "No IG cookie files available", code: "SESSION_EXPIRED" }));
          return;
        }
        let { cookieHeader, csrfToken } = igAccount;
        const igCookieFile = igAccount.file;

        // Helper: call IG mobile API via curl + WARP proxy (WITH auth — for search)
        function igApiFetch(apiUrl, method, postData) {
          const { execFileSync } = require("child_process");
          const args = [
            "-s", "--max-time", "20",
            "--socks5-hostname", "127.0.0.1:1080",
            "-H", "User-Agent: Instagram 344.0.0.0.98 Android (33/13; 420dpi; 1080x2340; samsung; SM-G991B; o1s; exynos2100)",
            "-H", "X-IG-App-ID: 936619743392459",
            "-H", "X-CSRFToken: " + csrfToken,
            "-H", "Cookie: " + cookieHeader,
          ];
          if (method === "POST") {
            args.push("-X", "POST", "-H", "Content-Type: application/x-www-form-urlencoded");
            if (postData) args.push("-d", postData);
          }
          args.push(apiUrl);
          try {
            return JSON.parse(execFileSync("curl", args, { maxBuffer: 10 * 1024 * 1024, timeout: 25000 }).toString());
          } catch (e) {
            return null;
          }
        }

        // Helper: fetch clips/user (public, no auth needed — safer)
        function fetchUserClips(userId, count) {
          const { execFileSync } = require("child_process");
          const args = [
            "-s", "--max-time", "20",
            "--socks5-hostname", "127.0.0.1:1080",
            "-H", "User-Agent: Instagram 344.0.0.0.98 Android (33/13; 420dpi; 1080x2340; samsung; SM-G991B; o1s; exynos2100)",
            "-H", "X-IG-App-ID: 936619743392459",
            "-X", "POST",
            "-H", "Content-Type: application/x-www-form-urlencoded",
            "-d", "target_user_id=" + userId + "&page_size=" + count,
            "https://i.instagram.com/api/v1/clips/user/",
          ];
          try {
            return JSON.parse(execFileSync("curl", args, { maxBuffer: 10 * 1024 * 1024, timeout: 25000 }).toString());
          } catch (e) {
            return null;
          }
        }

        // ── Language filter: detect non-English/Spanish captions ──────────────
        function isEnglishOrSpanish(text) {
          if (!text || text.length < 10) return true; // short or no caption — include it
          // Common non-Latin scripts: Hindi/Devanagari, Arabic, Bengali, Tamil, Thai, Chinese, Japanese, Korean, Cyrillic
          const nonLatinRatio = (text.match(/[\u0900-\u097F\u0600-\u06FF\u0980-\u09FF\u0B80-\u0BFF\u0E00-\u0E7F\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF\uAC00-\uD7AF\u0400-\u04FF]/g) || []).length / text.length;
          if (nonLatinRatio > 0.15) return false; // more than 15% non-Latin chars = foreign language
          return true;
        }

        // ── Smart query variants ─────────────────────────────────────────────
        const trimmed = query.trim();
        const variants = [trimmed];
        if (trimmed.includes(" ")) {
          variants.push(trimmed.replace(/\s+/g, ""));
          variants.push(trimmed.replace(/\s+/g, "_"));
        }

        const allPosts = [];
        const seenCodes = new Set();

        // ── Step 1: clips/search — IG's dedicated Reels search ───────────────
        console.log("[reels-search] Step 1: clips/search...");
        let clipsSearchCount = 0;
        let nextMaxId = null;
        for (let page = 0; page < 5; page++) {
          const postData = "query=" + encodeURIComponent(trimmed) +
            "&page_size=50" +
            (nextMaxId ? "&max_id=" + nextMaxId : "");
          const clipsData = igApiFetch(
            "https://i.instagram.com/api/v1/clips/search/",
            "POST",
            postData
          );

          if (!clipsData || clipsData.status !== "ok") {
            const msg = clipsData?.message || "Search failed";
            if (page === 0 && (msg === "login_required" || msg === "challenge_required")) {
              try {
                const { execSync } = require("child_process");
                execSync("cd /var/www && node ig-login.js", { timeout: 60000 });
                console.log("[reels-search] Cookie refresh completed");
              } catch {}
              res.writeHead(401, { ...corsHeaders, "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: "Session expired — cookies refreshed, please retry", code: "SESSION_REFRESHED" }));
              return;
            }
            if (page === 0) {
              console.log("[reels-search] clips/search failed:", msg, "— falling back to topsearch");
            }
            break;
          }

          const items = clipsData.items || [];
          if (items.length === 0) break;

          for (const item of items) {
            const media = item.media;
            if (!media || !media.code) continue;
            if (seenCodes.has(media.code)) continue;
            seenCodes.add(media.code);

            const captionText = media.caption?.text || "";
            if (!isEnglishOrSpanish(captionText)) continue; // skip non-EN/ES

            const views = media.play_count || media.view_count || 0;
            const likes = media.like_count || 0;
            const comments = media.comment_count || 0;
            const engagementRate = views > 0 ? ((likes + comments) / views * 100) : 0;

            allPosts.push({
              id: media.code,
              url: "https://www.instagram.com/reel/" + media.code + "/",
              thumbnail: media.image_versions2?.candidates?.[0]?.url || null,
              title: captionText,
              views,
              likes,
              comments,
              posted_at: media.taken_at || 0,
              owner_username: media.user?.username || "unknown",
              outlier_score: 1, // will recalculate per-account below
              account_avg_views: 0,
              engagement_rate: Math.round(engagementRate * 10) / 10,
              _source: "clips_search",
            });
            clipsSearchCount++;
          }

          nextMaxId = clipsData.next_max_id || null;
          if (!nextMaxId) break;

          // Short delay between pages
          await new Promise(r => setTimeout(r, 1000 + Math.floor(Math.random() * 500)));
        }
        console.log("[reels-search] clips/search returned", clipsSearchCount, "posts (after language filter)");

        // ── Step 2: topsearch_flat → user clips (for outlier scoring) ─────────
        console.log("[reels-search] Step 2: topsearch_flat for user discovery...");
        const searchData = igApiFetch(
          "https://i.instagram.com/api/v1/fbsearch/topsearch_flat/?query=" +
          encodeURIComponent(trimmed) + "&search_surface=top_search_page",
          "GET"
        );

        if (searchData && searchData.status === "ok") {
          const searchUsers = (searchData.list || [])
            .filter(item => item.user)
            .map(item => ({
              username: item.user.username,
              userId: item.user.pk || item.user.pk_id,
              fullName: item.user.full_name || "",
              followers: item.user.follower_count || 0,
            }))
            .slice(0, 15);

          const searchHashtags = new Set(
            (searchData.list || [])
              .filter(item => item.hashtag)
              .map(item => item.hashtag.name)
              .slice(0, 5)
          );
          for (const v of variants) {
            searchHashtags.add(v.replace(/[^a-z0-9_]/gi, "").toLowerCase());
          }

          console.log("[reels-search] Found", searchUsers.length, "users,", searchHashtags.size, "hashtags:", [...searchHashtags].join(", "));

          // Fetch clips from top users
          for (const user of searchUsers) {
            if (allPosts.length >= 1500) break;
            console.log("[reels-search] Fetching 40 clips for @" + user.username);
            const clipsData = fetchUserClips(user.userId, 40);

            if (!clipsData || clipsData.status !== "ok") continue;

            const items = clipsData.items || [];
            if (items.length === 0) continue;

            const userViews = items.map(i => i.media?.play_count || i.media?.view_count || 0);
            const userAvg = userViews.reduce((a, b) => a + b, 0) / userViews.length;

            for (const item of items) {
              const media = item.media;
              if (!media || !media.code) continue;
              if (seenCodes.has(media.code)) continue;
              seenCodes.add(media.code);

              const captionText = media.caption?.text || "";
              if (!isEnglishOrSpanish(captionText)) continue;

              const views = media.play_count || media.view_count || 0;
              const outlierScore = userAvg > 0 ? Math.round((views / userAvg) * 10) / 10 : 1;
              const likes = media.like_count || 0;
              const comments = media.comment_count || 0;
              const engagementRate = views > 0 ? ((likes + comments) / views * 100) : 0;

              allPosts.push({
                id: media.code,
                url: "https://www.instagram.com/reel/" + media.code + "/",
                thumbnail: media.image_versions2?.candidates?.[0]?.url || null,
                title: captionText,
                views,
                likes,
                comments,
                posted_at: media.taken_at || 0,
                owner_username: media.user?.username || user.username,
                outlier_score: outlierScore,
                account_avg_views: Math.round(userAvg),
                engagement_rate: Math.round(engagementRate * 10) / 10,
                _source: "user",
              });
            }

            const delay = 1500 + Math.floor(Math.random() * 1000);
            await new Promise(r => setTimeout(r, delay));
          }

          // ── Step 3: Hashtag clips ────────────────────────────────────────────
          for (const tag of searchHashtags) {
            if (allPosts.length >= 1500) break;

            console.log("[reels-search] Fetching clips for #" + tag);
            const tagMedias = [];
            let tagNextMaxId = null;
            for (let page = 0; page < 3; page++) {
              const postData = "tab=clips&page=" + page + (tagNextMaxId ? "&max_id=" + tagNextMaxId : "");
              const tagData = igApiFetch(
                "https://i.instagram.com/api/v1/tags/" + encodeURIComponent(tag) + "/sections/",
                "POST",
                postData
              );
              if (!tagData || tagData.status !== "ok") break;
              for (const section of (tagData.sections || [])) {
                for (const m of (section.layout_content?.medias || [])) {
                  if (m.media) tagMedias.push(m.media);
                }
              }
              tagNextMaxId = tagData.next_max_id || null;
              if (!tagNextMaxId) break;
            }

            if (tagMedias.length === 0) continue;

            const tagViews = tagMedias.map(m => m.play_count || m.view_count || 0);
            const tagAvg = tagViews.reduce((a, b) => a + b, 0) / tagViews.length;

            for (const media of tagMedias) {
              if (!media.code) continue;
              if (seenCodes.has(media.code)) continue;
              seenCodes.add(media.code);

              const captionText = media.caption?.text || "";
              if (!isEnglishOrSpanish(captionText)) continue;

              const views = media.play_count || media.view_count || 0;
              const outlierScore = tagAvg > 0 ? Math.round((views / tagAvg) * 10) / 10 : 1;
              const likes = media.like_count || 0;
              const comments = media.comment_count || 0;
              const engagementRate = views > 0 ? ((likes + comments) / views * 100) : 0;

              allPosts.push({
                id: media.code,
                url: "https://www.instagram.com/reel/" + media.code + "/",
                thumbnail: media.image_versions2?.candidates?.[0]?.url || null,
                title: captionText,
                views,
                likes,
                comments,
                posted_at: media.taken_at || 0,
                owner_username: media.user?.username || "unknown",
                outlier_score: outlierScore,
                account_avg_views: Math.round(tagAvg),
                engagement_rate: Math.round(engagementRate * 10) / 10,
                _source: "hashtag",
              });
            }

            const delay = 1500 + Math.floor(Math.random() * 1000);
            await new Promise(r => setTimeout(r, delay));
          }
        }

        // ── Recalculate outlier scores for clips_search results ──────────────
        // Group by owner and compute per-account averages
        const byOwner = {};
        for (const p of allPosts) {
          if (!byOwner[p.owner_username]) byOwner[p.owner_username] = [];
          byOwner[p.owner_username].push(p);
        }
        for (const [owner, posts] of Object.entries(byOwner)) {
          if (posts.length < 2) continue;
          const avg = posts.reduce((a, p) => a + p.views, 0) / posts.length;
          for (const p of posts) {
            if (p._source === "clips_search" || p.account_avg_views === 0) {
              p.outlier_score = avg > 0 ? Math.round((p.views / avg) * 10) / 10 : 1;
              p.account_avg_views = Math.round(avg);
            }
          }
        }

        // ── Filter: only viral posts (≥50k views) ─────────────────────────────
        const viralPosts = allPosts.filter(p => p.views >= 50000);

        // ── Sort: clips_search first (most relevant), then by views ───────────
        viralPosts.sort((a, b) => {
          const srcOrder = { clips_search: 2, hashtag: 1, user: 0 };
          const srcA = srcOrder[a._source] || 0;
          const srcB = srcOrder[b._source] || 0;
          if (srcB !== srcA) return srcB - srcA;
          return b.views - a.views;
        });
        const finalPosts = viralPosts.slice(0, safeLim);

        console.log("[reels-search] Done:", allPosts.length, "scraped,", viralPosts.length, "viral (≥50k views),", finalPosts.length, "returned for", JSON.stringify(query));
        console.log("[reels-search] Sources: clips_search=" + finalPosts.filter(p=>p._source==="clips_search").length + " user=" + finalPosts.filter(p=>p._source==="user").length + " hashtag=" + finalPosts.filter(p=>p._source==="hashtag").length);

        res.writeHead(200, { ...corsHeaders, "Content-Type": "application/json" });
        res.end(JSON.stringify({
          posts: finalPosts,
          totalPosts: finalPosts.length,
          query,
          platform: "instagram",
        }));
      } catch (err) {
        console.error("[reels-search] Error:", err.message);
        res.writeHead(500, { ...corsHeaders, "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // ── /health — liveness + load stats ────────────────────────────────────────

  // ==================== /youtube-captions ====================
  if (req.method === "POST" && req.url === "/youtube-captions") {
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", async () => {
      try {
        const { url } = JSON.parse(body);
        if (!url) { res.writeHead(400, corsHeaders); res.end(JSON.stringify({ error: "url required" })); return; }

        const isYT = /youtube\.com|youtu\.be/.test(url);
        if (!isYT) { res.writeHead(400, corsHeaders); res.end(JSON.stringify({ error: "Not a YouTube URL" })); return; }

        const { execSync } = require("child_process");
        const tmpDir = "/tmp/yt-subs-" + Date.now();
        const fs = require("fs");
        fs.mkdirSync(tmpDir, { recursive: true });

        try {
          // Try to get auto-generated or manual captions
          execSync(
            `yt-dlp --proxy socks5://127.0.0.1:1080 --skip-download --write-auto-subs --write-subs --sub-langs "en.*,es.*,en,es" --sub-format json3 --no-warnings --no-check-certificates -o "${tmpDir}/%(id)s" "${url}"`,
            { timeout: 30000, stdio: ["pipe", "pipe", "pipe"] }
          );

          // Find the subtitle file
          const files = fs.readdirSync(tmpDir).filter(f => f.endsWith(".json3"));
          if (files.length === 0) {
            res.writeHead(200, { ...corsHeaders, "Content-Type": "application/json" });
            res.end(JSON.stringify({ captions: null, reason: "no_captions_available" }));
            return;
          }

          // Prefer manual over auto, english over others
          const sorted = files.sort((a, b) => {
            const aAuto = a.includes(".auto.") ? 1 : 0;
            const bAuto = b.includes(".auto.") ? 1 : 0;
            if (aAuto !== bAuto) return aAuto - bAuto;
            const aEn = a.includes(".en") ? 0 : 1;
            const bEn = b.includes(".en") ? 0 : 1;
            return aEn - bEn;
          });

          const raw = JSON.parse(fs.readFileSync(`${tmpDir}/${sorted[0]}`, "utf-8"));
          
          // Extract text from json3 format
          const events = raw.events || [];
          const lines = [];
          for (const ev of events) {
            if (!ev.segs) continue;
            const text = ev.segs.map(s => s.utf8 || "").join("").trim();
            if (text && text !== "\n") lines.push(text);
          }
          const transcript = lines.join(" ").replace(/\s+/g, " ").trim();

          // Cleanup
          try { execSync(`rm -rf ${tmpDir}`); } catch {}

          res.writeHead(200, { ...corsHeaders, "Content-Type": "application/json" });
          res.end(JSON.stringify({ captions: transcript, lang: sorted[0], length: transcript.length }));
        } catch (e) {
          try { execSync(`rm -rf ${tmpDir}`); } catch {}
          // yt-dlp failed — no captions available
          console.log("[youtube-captions] yt-dlp error:", e.message?.slice(0, 200));
          res.writeHead(200, { ...corsHeaders, "Content-Type": "application/json" });
          res.end(JSON.stringify({ captions: null, reason: "yt_dlp_error", detail: (e.message || "").slice(0, 200) }));
        }
      } catch (e) {
        res.writeHead(500, corsHeaders);
        res.end(JSON.stringify({ error: e.message || "Failed" }));
      }
    });
    return;
  }

  
  // ==================== /scrape-single-url ====================
  // Single-URL stats fetch. Cookies-first for Instagram, yt-dlp for TT/YT.
  // With request coalescing (concurrent same-URL calls share one scrape)
  // and a 5-minute success cache so a viral URL shared across the team
  // only scrapes once. Cache is in-memory; pm2 restart clears it.
  if (req.method === "POST" && req.url === "/scrape-single-url") {
    let body;
    try {
      const raw = await new Promise((resolve, reject) => {
        let data = "";
        req.on("data", (c) => (data += c));
        req.on("end", () => resolve(data));
        req.on("error", reject);
      });
      body = JSON.parse(raw);
    } catch (_e) {
      res.writeHead(400, { ...corsHeaders, "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid JSON" })); return;
    }
    const { url } = body || {};
    if (!url || typeof url !== "string") {
      res.writeHead(400, { ...corsHeaders, "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "url is required" })); return;
    }

    // ── Lazy-init module-level cache + inflight maps. Hangs off globalThis
    //    so pm2 restart starts fresh but in-process they survive across
    //    requests. Keyed by normalized URL.
    if (!globalThis.__scrapeSingleCache) globalThis.__scrapeSingleCache = new Map();
    if (!globalThis.__scrapeSingleInflight) globalThis.__scrapeSingleInflight = new Map();
    const cache = globalThis.__scrapeSingleCache;
    const inflight = globalThis.__scrapeSingleInflight;
    const CACHE_TTL_MS = 5 * 60 * 1000;
    const cacheKey = url.split("?")[0]; // strip query so utm params don't fragment cache

    // ── Cache hit ────────────────────────────────────────────────────────────
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
      res.writeHead(200, { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "HIT" });
      res.end(JSON.stringify(cached.value)); return;
    }

    // ── In-flight coalesce — set up work BEFORE any await so concurrent
    //    requests for the same URL share one scrape. The map check + set
    //    is synchronous so the second/third concurrent caller sees the
    //    first caller's promise.
    let coalesced = false;

    const isInstagram = url.includes("instagram.com");

    const igPrivateApi = () => {
      if (!isInstagram) return null;
      const m = url.match(/\/(reel|reels|p)\/([A-Za-z0-9_-]+)/);
      if (!m) return null;
      const shortcode = m[2];
      const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
      let mediaId = BigInt(0);
      for (const ch of shortcode) {
        const idx = alphabet.indexOf(ch);
        if (idx < 0) return null;
        mediaId = mediaId * BigInt(64) + BigInt(idx);
      }
      const apiUrl = "https://i.instagram.com/api/v1/media/" + mediaId.toString() + "/info/";
      const { execFileSync } = require("child_process");

      const maxTries = (typeof IG_COOKIE_FILES !== "undefined" && Array.isArray(IG_COOKIE_FILES))
        ? IG_COOKIE_FILES.length : 2;
      for (let attempt = 0; attempt < Math.max(1, maxTries); attempt++) {
        if (typeof getNextIgCookies !== "function") break;
        const acc = getNextIgCookies();
        if (!acc) break;
        try {
          const out = execFileSync("curl", [
            "-s", "--max-time", "12",
            "--socks5-hostname", "127.0.0.1:1080",
            "-H", "User-Agent: Instagram 344.0.0.0.98 Android (33/13; 420dpi; 1080x2340; samsung; SM-G991B; o1s; exynos2100)",
            "-H", "X-IG-App-ID: 936619743392459",
            "-H", "X-CSRFToken: " + acc.csrfToken,
            "-H", "Cookie: " + acc.cookieHeader,
            apiUrl,
          ], { encoding: "utf8", timeout: 15000 });
          let parsed;
          try { parsed = JSON.parse(out); } catch (_pe) { continue; }
          const item = (parsed.items && parsed.items[0]) || null;
          if (!item) {
            if (parsed.message === "login_required" || parsed.message === "challenge_required" || parsed.require_login) {
              if (typeof markIgAccountStale === "function" && acc.file) markIgAccountStale(acc.file);
              continue;
            }
            return null;
          }
          const cands = (item.image_versions2 && item.image_versions2.candidates) || [];
          const thumbnail = (cands[0] && cands[0].url) || null;
          return {
            caption: (item.caption && item.caption.text || "").slice(0, 600),
            thumbnail,
            owner_username: (item.user && item.user.username) || null,
            views: Number(item.play_count || item.view_count || 0) || 0,
            likes: Number(item.like_count || 0) || 0,
            comments: Number(item.comment_count || 0) || 0,
            outlier_score: 0,
            posted_at: item.taken_at ? new Date(item.taken_at * 1000).toISOString() : null,
            duration: Number(item.video_duration || 0) || 0,
          };
        } catch (_e) { /* try next account */ }
      }
      return null;
    };

    // OG-tag scrape with a link-preview crawler UA — IG serves full
    // "<likes>, <comments> - <username> on <date>: <caption>" metadata to
    // bots anonymously (same door iMessage previews use). Views come from a
    // follow-up web_profile_info feed lookup (works with web cookies) when
    // the reel is among the owner's recent posts.
    const igBotPage = () => {
      if (!isInstagram) return null;
      const m = url.match(/\/(reel|reels|p)\/([A-Za-z0-9_-]+)/);
      if (!m) return null;
      const shortcode = m[2];
      const { execFileSync } = require("child_process");
      let html;
      try {
        html = execFileSync("curl", [
          "-s", "-L", "--max-time", "20",
          "--socks5-hostname", "127.0.0.1:1080",
          "-A", "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
          "https://www.instagram.com/reel/" + shortcode + "/",
        ], { encoding: "utf8", timeout: 25000, maxBuffer: 4 * 1024 * 1024 });
      } catch (_e) { return null; }
      const attr = (prop) => {
        const mm = html.match(new RegExp('<meta property="og:' + prop + '" content="([^"]*)"'));
        return mm ? mm[1] : "";
      };
      const decode = (s) => String(s || "")
        .replace(/&#x([0-9a-f]+);/gi, (_x, h) => String.fromCodePoint(parseInt(h, 16)))
        .replace(/&#(\d+);/g, (_x, d) => String.fromCodePoint(parseInt(d, 10)))
        .replace(/&quot;/g, '"').replace(/&amp;/g, "&");
      const ogDesc = decode(attr("description"));
      const ogTitle = decode(attr("title"));
      const ogImage = attr("image") ? decode(attr("image")) : null;
      // "143K likes, 1,163 comments - garyvee on May 26, 2026: ..."
      const head = ogDesc.match(/^([\d.,]+[KMB]?) likes?, ([\d.,]+[KMB]?) comments? - ([A-Za-z0-9_.]+) on ([A-Za-z]+ \d{1,2}, \d{4})/i);
      if (!head) return null;
      const compact = (s) => {
        const mm = String(s).replace(/,/g, "").match(/^([\d.]+)([KMB])?$/i);
        if (!mm) return 0;
        const mult = { K: 1e3, M: 1e6, B: 1e9 }[(mm[2] || "").toUpperCase()] || 1;
        return Math.round(parseFloat(mm[1]) * mult);
      };
      const username = head[3];
      const likes = compact(head[1]);
      const comments = compact(head[2]);
      let postedAt = null;
      const parsedDate = Date.parse(head[4] + " 12:00:00 UTC");
      if (!isNaN(parsedDate)) postedAt = new Date(parsedDate).toISOString();
      const capMatch = ogTitle.match(/ on Instagram: "([\s\S]*)"?$/);
      const caption = (capMatch ? capMatch[1] : ogTitle).replace(/"$/, "").slice(0, 600);

      // Views: look the shortcode up in the owner's recent feed (12 posts).
      let views = 0;
      try {
        if (typeof getNextIgCookies === "function") {
          const acc = getNextIgCookies();
          if (acc) {
            const out = execFileSync("curl", [
              "-s", "--max-time", "12", "--socks5-hostname", "127.0.0.1:1080",
              "-H", "X-IG-App-ID: 936619743392459",
              "-H", "Cookie: " + acc.cookieHeader,
              "https://i.instagram.com/api/v1/users/web_profile_info/?username=" + username,
            ], { encoding: "utf8", timeout: 15000, maxBuffer: 8 * 1024 * 1024 });
            const prof = JSON.parse(out);
            const edges = (((prof.data || {}).user || {}).edge_owner_to_timeline_media || {}).edges || [];
            for (const e of edges) {
              if (e.node && e.node.shortcode === shortcode) {
                views = Number(e.node.video_view_count || e.node.video_play_count || 0) || 0;
                if (e.node.taken_at_timestamp) postedAt = new Date(e.node.taken_at_timestamp * 1000).toISOString();
                break;
              }
            }
          }
        }
      } catch (_e) { /* views stay 0 — og data alone is still a win */ }

      return {
        caption,
        thumbnail: ogImage,
        owner_username: username,
        views,
        likes,
        comments,
        outlier_score: 0,
        posted_at: postedAt,
        duration: 0,
      };
    };

    const ytDlpJson = (extraArgs) => new Promise((resolve) => {
      const { execFile } = require("child_process");
      execFile("yt-dlp", [
        "-J", "--no-warnings", "--no-check-certificates",
        "--socket-timeout", "15", ...(extraArgs || []), url,
      ], { timeout: 25000, maxBuffer: 50 * 1024 * 1024 }, (err, stdout) => {
        if (err || !stdout) return resolve(null);
        try {
          const meta = JSON.parse(stdout);
          let postedAt = null;
          if (meta.timestamp && typeof meta.timestamp === "number") {
            postedAt = new Date(meta.timestamp * 1000).toISOString();
          } else if (meta.upload_date && meta.upload_date.length === 8) {
            const y = meta.upload_date.slice(0,4), mo = meta.upload_date.slice(4,6), d = meta.upload_date.slice(6,8);
            postedAt = new Date(y + "-" + mo + "-" + d + "T12:00:00Z").toISOString();
          }
          const thumbnail = meta.thumbnail
            || (Array.isArray(meta.thumbnails) && meta.thumbnails.length > 0
                ? meta.thumbnails[meta.thumbnails.length - 1].url : null);
          resolve({
            caption: String(meta.description || meta.title || "").slice(0, 600),
            thumbnail,
            owner_username: String(meta.uploader_id || meta.channel || meta.uploader || "").replace(/^@/, "") || null,
            views: Number(meta.view_count || 0) || 0,
            likes: Number(meta.like_count || 0) || 0,
            comments: Number(meta.comment_count || 0) || 0,
            outlier_score: 0,
            posted_at: postedAt,
            duration: Number(meta.duration || 0) || 0,
          });
        } catch (_e) { resolve(null); }
      });
    });

    // ── Real work, wrapped in an inflight promise others coalesce onto ───────
    let work = inflight.get(cacheKey);
    coalesced = !!work;
    if (!work) {
      work = (async () => {
      let result = null;
      if (isInstagram) {
        result = igPrivateApi();
        // media/info is dead for web-exported cookies; the crawler-UA OG
        // scrape is the reliable metadata path now.
        if (!result) result = igBotPage();
        // Last resort: yt-dlp with rotation cookies through WARP.
        for (let t = 0; t < 2 && !result; t++) {
          const acc = (typeof getNextIgCookies === "function") ? getNextIgCookies() : null;
          let ck = null;
          if (acc && acc.file && typeof writeIgCookieFile === "function") ck = writeIgCookieFile(acc.file);
          const extra = ["--proxy", "socks5://127.0.0.1:1080"];
          if (ck) extra.push("--cookies", ck);
          result = await ytDlpJson(extra);
          if (ck) { try { fs.unlinkSync(ck); } catch (_e) { /* tmp file */ } }
        }
      } else {
        result = await ytDlpJson();
      }
      if (result) {
        cache.set(cacheKey, { at: Date.now(), value: result });
        // Bound cache size — drop oldest if we ever exceed 500 entries
        if (cache.size > 500) {
          const firstKey = cache.keys().next().value;
          cache.delete(firstKey);
        }
      }
      return result;
      })();
      inflight.set(cacheKey, work);
      work.finally(() => { inflight.delete(cacheKey); });
    }
    // (work setter moved earlier so concurrent requests share the promise)

    try {
      const result = await work;
      if (!result) {
        res.writeHead(404, { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "MISS" });
        res.end(JSON.stringify({ error: "scrape_failed" })); return;
      }
      res.writeHead(200, { ...corsHeaders, "Content-Type": "application/json", "X-Cache": coalesced ? "COALESCED" : "MISS" });
      res.end(JSON.stringify(result));
    } catch (err) {
      console.error("[scrape-single-url] error:", err.message);
      res.writeHead(500, { ...corsHeaders, "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "internal_error", message: err.message }));
    }
    return;
  }

  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', activeHeavy, maxHeavy: MAX_HEAVY, pid: process.pid, uptime: Math.round(process.uptime()) }));
    return;
  }

  // 404 for everything else
  res.writeHead(404);
  res.end(JSON.stringify({ error: "Not found" }));
});


server.listen(PORT, "0.0.0.0", () => {
  console.log(`yt-dlp audio extraction server running on port ${PORT}`);
});

// Graceful shutdown -- release port before PM2 starts a new instance
process.on("SIGTERM", () => {
  console.log("[shutdown] SIGTERM received, closing server...");
  server.close(() => {
    console.log("[shutdown] Server closed.");
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000);
});

process.on("SIGINT", () => {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000);
});
