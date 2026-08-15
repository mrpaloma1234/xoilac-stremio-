const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const axios = require("axios");
const cheerio = require("cheerio");

const BASE_URL = "https://xoilacxtr.tv";

const manifest = {
  id: "org.xoilac.appletv.v2",
  version: "1.0.6",
  name: "Xoilac TV (Apple TV Fix)",
  description: "Trực tiếp bóng đá Xoilac TV tối ưu Apple TV",
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

const customHeaders = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Referer": BASE_URL,
  "Origin": BASE_URL
};

builder.defineCatalogHandler(async () => {
  try {
    const { data } = await axios.get(BASE_URL, { headers: customHeaders, timeout: 6000 });
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
          const rawId = Buffer.from(link).toString("base64url");
          metas.push({
            id: `xoilac_${rawId}`,
            type: "tv",
            name: title,
            poster: img || "https://v3.strem.io/res/stremio.png",
            description: `Trực tiếp: ${title}`
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

builder.defineMetaHandler(async (args) => {
  return {
    meta: {
      id: args.id,
      type: "tv",
      name: "Trực Tiếp Bóng Đá",
      poster: "https://v3.strem.io/res/stremio.png",
      background: "https://v3.strem.io/res/stremio.png",
      description: "Đang kết nối luồng trực tiếp..."
    }
  };
});

builder.defineStreamHandler(async (args) => {
  try {
    const rawPath = Buffer.from(args.id.replace("xoilac_", ""), "base64url").toString("utf-8");
    const targetUrl = rawPath.startsWith("http") ? rawPath : `${BASE_URL}${rawPath}`;

    const { data } = await axios.get(targetUrl, { headers: customHeaders, timeout: 6000 });
    const $ = cheerio.load(data);
    const streams = [];

    // 1. Quét tìm link m3u8 chuẩn trong HTML/JS
    const m3u8Matches = data.match(/https?:\/\/[^"' ]+\.m3u8[^"' ]*/g) || [];
    m3u8Matches.forEach((streamUrl, idx) => {
      streams.push({
        title: `Xoilac Direct HD ${idx + 1}`,
        url: streamUrl,
        behaviorHints: {
          isLive: true,
          proxyHeaders: {
            "request": customHeaders
          }
        }
      });
    });

    // 2. Tìm iframe player (dành cho Apple TV)
    $("iframe").each((_, el) => {
      const src = $(el).attr("src");
      if (src && (src.includes("embed") || src.includes("player") || src.includes("http"))) {
        streams.push({
          title: "Xoilac Embed Player",
          url: src.startsWith("//") ? `https:${src}` : src,
          behaviorHints: { isLive: true }
        });
      }
    });

    // 3. Fallback Web Link nếu không bóc được stream
    if (streams.length === 0) {
      streams.push({
        title: "Xem trực tiếp qua Web Player",
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
