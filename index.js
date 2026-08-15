const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const axios = require("axios");
const cheerio = require("cheerio");

const BASE_URL = "https://xoilackvy.tv";

const manifest = {
  id: "org.xoilac.livefootball",
  version: "1.0.0",
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

    $(".match-item, .item-match, div[class*='match']").each((index, element) => {
      const matchName = $(element).find(".match-title, .team-name, .title").text().trim() || `Trận đấu ${index + 1}`;
      const matchLink = $(element).find("a").attr("href");
      const time = $(element).find(".time, .status").text().trim();

      if (matchLink) {
        const matchId = Buffer.from(matchLink).toString("base64");
        metas.push({
          id: `xoilac_${matchId}`,
          type: "tv",
          name: `${time ? "[" + time + "] " : ""}${matchName}`,
          poster: "https://v3.strem.io/res/stremio.png",
          description: `Xem trực tiếp ${matchName} trên Xoilac TV`
        });
      }
    });

    return { metas };
  } catch (error) {
    console.error("Lỗi khi cào danh sách Xoilac:", error.message);
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
console.log(`Addon Xoilac đang chạy tại cổng ${PORT}`);
