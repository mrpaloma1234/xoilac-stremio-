const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const axios = require("axios");
const cheerio = require("cheerio");

const BASE_URL = "https://xoilacxtr.tv";

const manifest = {
  id: "org.xoilac.appletv.native",
  version: "2.0.0",
  name: "Xoilac TV (Apple TV Native)",
  description: "Trực tiếp bóng đá xem ngay trong Player của Apple TV",
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

// 1. Lấy danh sách trận đấu
builder.defineCatalogHandler(async () => {
  try {
    const { data } = await axios.get(BASE_URL, { headers: customHeaders, timeout: 5000 });
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

// 2. Định nghĩa Meta
builder.defineMetaHandler(async (args) => {
  return {
    meta: {
      id: args.id,
      type: "tv",
      name: "Trực Tiếp Bóng Đá",
      poster: "https://v3.strem.io/res/stremio.png",
      background: "https://v3.strem.io/res/stremio.png",
      description: "Đang kết nối luồng phát Apple TV..."
    }
  };
});

// 3. Giải mã luồng m3u8 phát trực tiếp trong Player Apple TV
builder.defineStreamHandler(async (args) => {
  try {
    const rawPath = Buffer.from(args.id.replace("xoilac_", ""), "base64url").toString("utf-8");
    const targetUrl = rawPath.startsWith("http") ? rawPath : `${BASE_URL}${rawPath}`;

    // Request vào trang chi tiết trận đấu
    const { data } = await axios.get(targetUrl, { headers: customHeaders, timeout: 5000 });
    
    const streams = [];

    // Bóc tách tất cả link .m3u8 tĩnh hoặc link CDN từ trang
    const m3u8Matches = data.match(/https?:\/\/[^"' ]+\.m3u8[^"' ]*/g) || [];

    if (m3u8Matches.length > 0) {
      // Lọc bỏ các link trùng lặp
      const uniqueM3u8 = [...new Set(m3u8Matches)];
      
      uniqueM3u8.forEach((m3u8Url, idx) => {
        streams.push({
          title: `Server HD ${idx + 1} (Phát Native Apple TV)`,
          url: m3u8Url,
          behaviorHints: {
            isLive: true,
            proxyHeaders: {
              "request": {
                "User-Agent": customHeaders["User-Agent"],
                "Referer": targetUrl,
                "Origin": BASE_URL
              }
            }
          }
        });
      });
    }

    // Nếu không tìm thấy m3u8 trực tiếp, quét lấy ID trận đấu để gọi API JSON CDN Xoilac
    if (streams.length === 0) {
      const matchIdMatch = data.match(/match_id\s*=\s*["']?(\d+)["']?/);
      if (matchIdMatch && matchIdMatch[1]) {
        const matchId = matchIdMatch[1];
        const apiUrl = `${BASE_URL}/api/match/stream/${matchId}`;
        
        try {
          const apiRes = await axios.get(apiUrl, { headers: { ...customHeaders, "Referer": targetUrl }, timeout: 4000 });
          if (apiRes.data && apiRes.data.play_url) {
            streams.push({
              title: "Server API HD (Apple TV Direct)",
              url: apiRes.data.play_url,
              behaviorHints: {
                isLive: true,
                proxyHeaders: {
                  "request": {
                    "User-Agent": customHeaders["User-Agent"],
                    "Referer": BASE_URL
                  }
                }
              }
            });
          }
        } catch (e) {
          // Bỏ qua nếu API lỗi
        }
      }
    }

    return { streams };
  } catch (error) {
    return { streams: [] };
  }
});

const PORT = process.env.PORT || 7000;
serveHTTP(builder.getInterface(), { port: PORT });
