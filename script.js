const mysql = require("mysql2");
const puppeteer = require("puppeteer");
require("dotenv").config();

const auth = process.env.AUTH_TOKEN;
const headless = +process.env.HEADLESS;
// create the connection to database
const connection = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

const timeout = (ms) => new Promise((res) => setTimeout(res, ms));

async function scrape() {
  try {
    await connection.promise().query(
      `CREATE TABLE IF NOT EXISTS history (
    id bigint NOT NULL AUTO_INCREMENT primary key,
    game varchar(100) NOT NULL,
    game_id bigint NOT NULL,
    username VARCHAR(255) NOT NULL,
    wagered bigint NOT NULL,
    profit bigint NOT NULL,
    isOSRS boolean NOT NULL,
    created_at DATETIME NOT NULL DEFAULT NOW()
  ) ENGINE=MyISAM;`
    );

    const browser = await puppeteer.launch({ headless });
    const page = await browser.newPage();
    await page.goto("https://www.runebet.com", {
      waitUntil: "networkidle0",
    });
    await page.evaluate((token) => {
      localStorage.setItem("dd-auth", token);
    }, auth);
    await page.reload({ waitUntil: "networkidle0" });

    await timeout(5000);

    const a = await page.$("tbody");
    if (!a) throw new Error("not authenticated");

    let lastSavedId = null;
    while (true) {
      await timeout(1500);
      /**
       * 
      a = [
        [
          'Keno',
          '80,690,140',
          'nortdawgdub',
          '1:13 PM',
          '5K OSRS',
          '1.09×',
          '450'
        ]
      ]
       */
      const a = await page.$$eval("tbody tr", (el) =>
        [].map.call(el, (el) =>
          [].map.call(el.children, (el) => el.innerText.trim())
        )
      );

      const i = a.findIndex((el) => el[1] == lastSavedId);
      const newHistory = i == -1 ? a.slice(0) : a.slice(0, i);

      if (!newHistory.length) continue;
      /**
       * 
      newHistory = [
        [
          'Keno',
          80690140,
          'nortdawgdub',
          5000,
          5000,
          'OSRS',
        ]
      ]
       */
      const historyToSave = newHistory.map((h) => [
        h[0],
        parseInt(h[1].replace(/,/g, ""), 10),
        h[2],
        parseBet(h[4].split(" ")[0]),
        parseBet(h[6].split(" ")[0]),
        +(h[4].split(" ")[1] == "OSRS"),
      ]);
      try {
        await connection
          .promise()
          .query(
            `insert into history(game,game_id,username,wagered,profit,isOSRS) values (${historyToSave
              .map((h) =>
                h.map((v) => (typeof v == "number" ? v : `'${v}'`)).join(",")
              )
              .join("),(")})`
          );
        lastSavedId = newHistory[0][1];
      } catch (error) {
        console.error(error);
      }
    }
  } catch (error) {
    console.error(error);
  }
}
scrape();

function parseBet(betString) {
  const sign = betString[0] == "-" ? -1 : 1;
  const bet = betString
    .toString()
    .replace(/,/gi, ".")
    .replace(/[^kKmMbB0-9.]/gi, "")
    .trim()
    .toLowerCase();

  switch (bet.charAt(bet.length - 1)) {
    case "k":
      return (
        sign * Math.round(parseFloat(bet.substr(0, bet.length - 1)) * 1000)
      );
    case "m":
      return (
        sign * Math.round(parseFloat(bet.substr(0, bet.length - 1)) * 1000000)
      );
    case "b":
      return (
        sign *
        Math.round(parseFloat(bet.substr(0, bet.length - 1)) * 1000000000)
      );
    default:
      return sign * Math.round(parseFloat(bet));
  }
}
