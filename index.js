const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const axios = require("axios");
const cheerio = require("cheerio");

const BASE_URL = "https://xoilacxtr.tv";

const manifest = {
  id: "org.xoilac.livefootball.v3",
  version: "1.0.3",
  name: "Xoilac TV Live Sports",
  description: "Trực tiếp bóng đá Xoilac TV",
  resources: ["catalog", "meta", "stream"],
  types: ["tv"],
  catalogs: [
    {
      type: "tv",
      id: "xoilac_matches",
      name: "Xoilac - Trận Đấu Trực Tiếp"
    }
  ],
  idPrefixes: ["xoilac_"]
};

const builder = new addonBuilder(manifest);

const headers = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Referer": BASE_URL
};

// 1. Catalog Handler
builder.defineCatalogHandler(async () => {
  try {
    const { data } = await axios.get(BASE_URL, { headers, timeout: 5000 });
    const $ = cheerio.load(data);
    const metas = [];

    $("a").each((_, element) => {
      const link = $(element).attr("href");
      if (link && (link.includes("/truc-tiep/") || link.includes("/match/"))) {
        let img = $(element).find("img").attr("src") || $(element).find("img").attr("data-src");
        let title = $(element).attr("title") || $(element).text().trim();
        title = title.replace(/\s+/g, " ").trim();

        if (img && !img.startsWith("http")) {
          img = img.startsWith("//") ? `https:${img}` : `${BASE_URL}${img}`;
        }

        if (title.length > 3) {
          const rawId = encodeURIComponent(link);
          metas.push({
            id: `xoilac_${rawId}`,
            type: "tv",
            name: title,
            poster: img || "https://v3.strem.io/res/stremio.png",
            description: `Xem trực tiếp ${title}`
          });
        }
      }
    });

    const uniqueMetas = Array.from(new Set(metas.map(a => a.id))).map(id => metas.find(a => a.id === id));
    return { metas: uniqueMetas };
  } catch (error) {
    return { metas: [] };
  }
});

// 2. Meta Handler (Giải quyết triệt để lỗi xoay vòng trên TV)
builder.defineMetaHandler(async (args) => {
  const matchPath = decodeURIComponent(args.id.replace("xoilac_", ""));
  return {
    meta: {
      id: args.id,
      type: "tv",
      name: "Xoilac Trực Tiếp Bóng Đá",
      poster: "https://v3.strem.io/res/stremio.png",
      background: "https://v3.strem.io/res/stremio.png",
      description: "Đang tải luồng trực tiếp từ Xoilac TV...",
      genres: ["Sports", "Live TV"]
    }
  };
});

// 3. Stream Handler
builder.defineStreamHandler(async (args) => {
  try {
    const matchPath = decodeURIComponent(args.id.replace("xoilac_", ""));
    const targetUrl = matchPath.startsWith("http") ? matchPath : `${BASE_URL}${matchPath}`;

    const { data } = await axios.get(targetUrl, { headers, timeout: 5000 });

    const m3u8Matches = data.match(/https?:\/\/[^"' ]+\.m3u8[^"' ]*/g) || [];
    let streams = [];

    if (m3u8Matches.length > 0) {
      streams = m3u8Matches.map((streamUrl, idx) => ({
        title: `Xoilac Direct - Server ${idx + 1}`,
        url: streamUrl,
        behaviorHints: {
          notSupported: false,
          proxyHeaders: { "request": { "User-Agent": headers["User-Agent"], "Referer": BASE_URL } }
        }
      }));
    } else {
      // Dùng Web View / External Stream nếu không bóc tách được trực tiếp file m3u8
      streams.push({
        title: "Xoilac Web Player (Mở trong trình duyệt/Player ngoài)",
        externalUrl: targetUrl
      });
    }

    return { streams };
  } catch (error) {
    return { streams: [] };
  }
});

const PORT = process.env.PORT || 7000;
serveHTTP(builder.getInterface(), { port: PORT });
