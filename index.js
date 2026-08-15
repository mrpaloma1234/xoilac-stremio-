const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const axios = require("axios");
const cheerio = require("cheerio");

const BASE_URL = "https://xoilacxtr.tv";

const manifest = {
  id: "org.xoilac.livefootball",
  version: "1.0.1",
  name: "Xoilac TV Live Sports",
  description: "Trực tiếp bóng đá Ngoại hạng Anh & các giải đấu từ Xoilac TV",
  resources: ["catalog", "stream"],
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

builder.defineCatalogHandler(async (args) => {
  try {
    const { data } = await axios.get(BASE_URL, { headers });
    const $ = cheerio.load(data);
    const metas = [];

    // Tìm tất cả các thẻ liên kết trận đấu
    $("a").each((index, element) => {
      const link = $(element).attr("href");
      
      // Lọc các đường dẫn vào trang trận đấu
      if (link && (link.includes("/truc-tiep/") || link.includes("/match/"))) {
        // Tìm ảnh thumbnail/poster
        let img = $(element).find("img").attr("src") || 
                  $(element).find("img").attr("data-src") || 
                  $(element).parent().find("img").attr("src") ||
                  $(element).parent().find("img").attr("data-src");

        // Tìm tiêu đề trận đấu hoặc tên đội bóng
        let title = $(element).attr("title") || 
                    $(element).find(".title, .match-title, .name, .team-name").text().trim() ||
                    $(element).text().trim();

        // Xử lý tiêu đề không bị rác văn bản
        title = title.replace(/\s+/g, " ").trim();

        // Xử lý link ảnh chuẩn
        if (img && !img.startsWith("http")) {
          img = img.startsWith("//") ? `https:${img}` : `${BASE_URL}${img}`;
        }

        if (link && title.length > 3) {
          const matchId = Buffer.from(link).toString("base64");
          metas.push({
            id: `xoilac_${matchId}`,
            type: "tv",
            name: title,
            poster: img || "https://v3.strem.io/res/stremio.png",
            description: `Xem trực tiếp ${title} trên Xoilac TV`
          });
        }
      }
    });

    // Lọc bỏ các mục bị trùng lặp
    const uniqueMetas = Array.from(new Set(metas.map(a => a.id)))
      .map(id => metas.find(a => a.id === id));

    return { metas: uniqueMetas };
  } catch (error) {
    console.error("Lỗi khi cào dữ liệu Xoilac:", error.message);
    return { metas: [] };
  }
});

builder.defineStreamHandler(async (args) => {
  try {
    const matchPath = Buffer.from(args.id.replace("xoilac_", ""), "base64").toString("utf-8");
    const targetUrl = matchPath.startsWith("http") ? matchPath : `${BASE_URL}${matchPath}`;

    const { data } = await axios.get(targetUrl, { headers });

    const m3u8Matches = data.match(/https?:\/\/[^"' ]+\.m3u8[^"' ]*/g);

    if (m3u8Matches && m3u8Matches.length > 0) {
      const streams = m3u8Matches.map((streamUrl, idx) => ({
        title: `Xoilac HD - Server ${idx + 1}`,
        url: streamUrl,
        behaviorHints: {
          notSupported: false,
          proxyHeaders: {
            "request": {
              "User-Agent": headers["User-Agent"],
              "Referer": BASE_URL
            }
          }
        }
      }));

      return { streams };
    }

    return { streams: [] };
  } catch (error) {
    console.error("Lỗi khi lấy stream Xoilac:", error.message);
    return { streams: [] };
  }
});

const PORT = process.env.PORT || 7000;
serveHTTP(builder.getInterface(), { port: PORT });

