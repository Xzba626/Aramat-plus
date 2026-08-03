import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const path = join(process.cwd(), "src/messages/tj.json");
const j = JSON.parse(readFileSync(path, "utf8"));
j.settingsPage.wipeDesc =
  "Нест кардани мол, фурӯш ва маълумоти тестӣ. Логини соҳиб ба ҳолати аввал бармегардад.";
j.wipe.keepOwner =
  "Ҳисоби соҳиб (логин ва рамз ба ҳолати аввал бармегарданд)";
j.wipe.wipeHint =
  "Нест мешаванд: молҳо, партияҳо, боқимонда, фурӯшҳо, филиалҳо, кормандон (ба ҷуз соҳиб), хароҷот, бозгаштҳо, журналҳо. Логини соҳиб ба ҳолати аввал бармегардад.";
j.wipe.doneHint =
  "Бо логин ва рамзи аввал (аз қуттӣ) дубора ворид шавед. Баъд метавонед рамзро иваз кунед.";
j.storesPage.delete = "Нест кардан";
j.storesPage.deleteForever = "Пурмаъно нест кардан";
j.storesPage.deleteForeverConfirm =
  "Филиалро бо фурӯшҳо ва боқимондаҳояш пурмаъно нест кунем?";
j.settingsSub = j.settingsSub || {};
j.settingsSub.archiveRetention = "Мӯҳлати нигоҳдории архив (рӯз)";
j.settingsSub.archiveRetentionHint =
  "Пас аз ин мӯҳлат объектҳои архившуда худкор пурмаъно нест мешаванд.";
writeFileSync(path, JSON.stringify(j, null, 2) + "\n", "utf8");
console.log("tj.json patched");
