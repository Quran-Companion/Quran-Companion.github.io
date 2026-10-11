// Unit test for the recitation matcher: authentic Uthmani verse text (Tanzil) vs what a speech
// recogniser would write (everyday spelling, typed here for test purposes only).
import { readFileSync } from 'node:fs';
const { matchRecitation, skeleton } = await import('/home/claude/quran-companion/src/lib/recite.js');
const FX = JSON.parse(readFileSync(new URL('./tanzil-fixture.json', import.meta.url)));
const V = (k) => FX.verses[k];
const ctx = (k) => { const [surah, ayah] = k.split(':').map(Number); return { surah, ayah }; };
const THR = 0.7;
let pass = 0, fail = 0;
function t(name, key, said, expectOk) {
  const r = matchRecitation(V(key), said, ctx(key));
  const ok = r.coverage >= THR;
  const good = ok === expectOk;
  good ? pass++ : fail++;
  console.log(`${good ? 'PASS' : 'FAIL'}  ${name.padEnd(46)} ${key.padEnd(6)} cov=${(r.coverage * 100).toFixed(0)}%`);
}
// Correct recitations (as speech recognition typically writes them)
t('Fatiha 1', '1:1', 'بسم الله الرحمن الرحيم', true);
t('Fatiha 2', '1:2', 'الحمد لله رب العالمين', true);
t('Fatiha 4', '1:4', 'مالك يوم الدين', true);
t('Fatiha 5', '1:5', 'إياك نعبد وإياك نستعين', true);
t('Fatiha 6', '1:6', 'اهدنا الصراط المستقيم', true);
t('Fatiha 7', '1:7', 'صراط الذين أنعمت عليهم غير المغضوب عليهم ولا الضالين', true);
t('Ikhlas 1 (without Basmala)', '112:1', 'قل هو الله أحد', true);
t('Ikhlas 1 (with Basmala)', '112:1', 'بسم الله الرحمن الرحيم قل هو الله أحد', true);
t('Ikhlas 4', '112:4', 'ولم يكن له كفوا أحد', true);
t('Muddaththir 1 (split يا أيها)', '74:1', 'يا أيها المدثر', true);
t('Muddaththir 2', '74:2', 'قم فأنذر', true);
t('Muddaththir 5', '74:5', 'والرجز فاهجر', true);
t('Recogniser writes hamza differently', '1:5', 'اياك نعبد واياك نستعين', true);
t('One word slightly misheard', '1:7', 'صراط الذين انعمت عليهم غير المغضوب عليهم ولا الظالين', true);
// Wrong / not the verse
t('Random speech', '1:2', 'السلام عليكم ورحمة الله', false);
t('Random speech', '74:2', 'انا بحب الكورة', false);
t('A different verse', '1:2', 'مالك يوم الدين', false);
t('Only the first word', '1:7', 'صراط', false);
t('Half the verse', '1:7', 'صراط الذين أنعمت عليهم', false);
t('Only Basmala on verse 1', '112:1', 'بسم الله الرحمن الرحيم', false);
t('Silence', '112:2', '', false);
t('Next verse instead', '112:3', 'ولم يكن له كفوا أحد', false);
console.log(`\n${pass}/${pass + fail} passed`);
console.log('skeleton check:', skeleton(V('74:1')), '|', skeleton('يا أيها المدثر'));
process.exit(fail ? 1 : 0);
