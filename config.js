/* Настройки игры: правила по времени, ссылки, хранение прогресса
   Меняются здесь, а не в коде */
const CONFIG = {
  storageKey:'szch-level1-v3',   // ключ сохранения партии; меняется, когда меняется устройство партии
  consentMinutes:2,              // карта «Согласие и запись»
  probeMinutes:1,                // одна проба
  maxProbes:2,                   // проб на ключевой вопрос
  reserveMinutes:5,              // обязательный резерв в конце

  /* Apps Script таблицы бота: принимает гайд для отправки на почту и анонимную статистику игры */
  scriptUrl:'https://script.google.com/macros/s/AKfycbzmx4wjaCguuGiW1P7LqKvBqeu8_qKAIS_KczNK68-zSAIkw5taQuR_hN4l9dj8eW_AfQ/exec',

  copyrightYear:2026,
  author:'Безгласная Е. А.',
  links:{
    privacy:'https://tracker63.tilda.ws/privacy',
    license:'https://creativecommons.org/licenses/by-nc-nd/4.0/deed.ru',
    licenseName:'CC BY-NC-ND 4.0',
    source:'https://github.com/helenforcevoice-ai/interview-game'
  }
};
