import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync, crc32 } from 'node:zlib';
import {
  parseCsv, sniffDelimiter, parseDate, parseAmount, inferDecimal, inferDateOrder, monthOf, readFile,
  analyzeWorkbook, markDuplicates, groupForCategorizing, batchGroups, buildCategorizePrompt, parseAiJson,
  applySuggestions, rowProblems, toEntryDoc, merchantKey, ImportError,
} from '../public/legacy/importer.js';

const enc = (s) => new TextEncoder().encode(s);
const analyze = async (name, text) => analyzeWorkbook(await readFile(name, enc(text)), { fileName: name });

// ---- a tiny .xlsx writer, so XLSX parsing is tested against real zip + xml structure
function zip(files) {
  const locals = [], centrals = []; let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const data = enc(content), comp = deflateRawSync(data), nameB = enc(name), crc = crc32(data);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(8, 8);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nameB.length, 26);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(8, 10);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nameB.length, 28); ch.writeUInt32LE(offset, 42);
    locals.push(lh, nameB, comp); centrals.push(ch, nameB); offset += 30 + nameB.length + comp.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(centrals.length / 2, 8); end.writeUInt16LE(centrals.length / 2, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...locals, cd, end]));
}
function xlsx(sheets, shared) {
  const files = {
    'xl/workbook.xml': `<workbook xmlns:r="r"><sheets>${sheets.map((s, i) => `<sheet name="${s.name}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `<Relationships>${sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}</Relationships>`,
    'xl/sharedStrings.xml': `<sst>${shared.map((s) => `<si><t>${s}</t></si>`).join('')}</sst>`,
    'xl/styles.xml': '<styleSheet><numFmts><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts><cellXfs><xf numFmtId="0"/><xf numFmtId="164"/><xf numFmtId="4"/></cellXfs></styleSheet>',
  };
  sheets.forEach((s, i) => { files[`xl/worksheets/sheet${i + 1}.xml`] = `<worksheet><sheetData>${s.xml}</sheetData></worksheet>`; });
  return zip(files);
}

test('CSV: delimiter sniffing, quotes, BOM, CRLF', () => {
  assert.equal(sniffDelimiter('a;b;c\n1;2;3'), ';');
  assert.equal(sniffDelimiter('a\tb\n1\t2'), '\t');
  assert.deepEqual(parseCsv('﻿a,"b, c","say ""hi"""\r\n1,2,3\r\n\r\n'), [['a', 'b, c', 'say "hi"'], ['1', '2', '3']]);
});

test('amounts: European, US, signs, currency', () => {
  assert.equal(parseAmount('-1.234,56 €', ','), -1234.56);
  assert.equal(parseAmount('1,234.56', '.'), 1234.56);
  assert.equal(parseAmount('(12.50)', '.'), -12.5);
  assert.equal(parseAmount('12,50-', ','), -12.5);
  assert.equal(parseAmount('Mercadona', ','), null);
  assert.equal(inferDecimal(['1.234,56', '12,00', '3']), ',');
  assert.equal(inferDecimal(['1,234.56', '12.00']), '.');
});

test('dates: orders, names, serials, invalid', () => {
  assert.equal(parseDate('2026-09-14'), '2026-09-14');
  assert.equal(parseDate('14/09/2026'), '2026-09-14');
  assert.equal(parseDate('09/14/2026', 'mdy'), '2026-09-14');
  assert.equal(parseDate('14.09.26'), '2026-09-14');
  assert.equal(parseDate('12 sept 2026'), '2026-09-12');
  assert.equal(parseDate('Sep 12, 2026'), '2026-09-12');
  assert.equal(parseDate('31/02/2026'), null);
  assert.equal(parseDate(46279), '2026-09-14');
  assert.equal(inferDateOrder(['09/14/2026', '09/01/2026']), 'mdy');
  assert.equal(monthOf('Enero'), 0); assert.equal(monthOf('Set'), 8); assert.equal(monthOf('Total'), -1);
});

test('Spanish bank export: preamble lines, semicolons, cargo/abono sign, balance ignored', async () => {
  const csv = [
    'Cuenta: ES12 3456;;;;', 'Titular: Felipe;;;;', '',
    'Fecha operación;Fecha valor;Concepto;Importe;Saldo',
    '14/09/2026;15/09/2026;MERCADONA 1234 BARCELONA;-62,38;1.937,62',
    '15/09/2026;15/09/2026;NOMINA DOCPLANNER;3.500,00;5.437,62',
    '16/09/2026;16/09/2026;"BAR, LA PEPITA";-4,50;5.433,12',
  ].join('\n');
  const r = await analyze('movimientos.csv', csv);
  assert.equal(r.sheets[0].shape, 'transactions');
  assert.equal(r.candidates.length, 3);
  const [a, b, c] = r.candidates;
  assert.deepEqual([a.date, a.amount, a.type, a.description], ['2026-09-14', 62.38, 'expense', 'MERCADONA 1234 BARCELONA']);
  assert.deepEqual([b.amount, b.type], [3500, 'income']);
  assert.equal(c.description, 'BAR, LA PEPITA');
  assert.equal(a.source.row, 5);
});

test('US export with debit/credit columns and month/day dates', async () => {
  const csv = 'Date,Description,Debit,Credit,Currency\n09/14/2026,Coffee,4.50,,USD\n09/15/2026,Refund,,20.00,USD\n';
  const r = await analyze('card.csv', csv);
  assert.equal(r.candidates.length, 2);
  assert.equal(r.candidates[0].date, '2026-09-14');
  assert.equal(r.candidates[0].type, 'expense');
  assert.equal(r.candidates[1].type, 'income');
  assert.ok(r.candidates[0].flags.includes('currency'));
  assert.ok(rowProblems(r.candidates[0]).includes('currency'));
});

test('all-positive single amount column: read as expenses, with a warning; ambiguous dates warned', async () => {
  const r = await analyze('x.csv', 'date,description,amount\n01/02/2026,Gym,30\n03/02/2026,Books,12');
  assert.ok(r.candidates.every((c) => c.type === 'expense'));
  assert.ok(r.warnings.some((w) => w.code === 'all_positive'));
  assert.ok(r.warnings.some((w) => w.code === 'date_order_assumed'));
});

test('headerless CSV: roles inferred from content', async () => {
  const r = await analyze('raw.csv', '2026-09-01;Rent September;-900,00;1.100,00\n2026-09-03;Salary;2.500,00;3.600,00\n');
  assert.equal(r.candidates.length, 2);
  assert.deepEqual([r.candidates[0].description, r.candidates[0].amount, r.candidates[1].type], ['Rent September', 900, 'income']);
});

test('monthly grid (budget sheet like the owner\'s): sections, categories, totals skipped', async () => {
  const csv = [
    'Budget 2025;;;;;;;;;;;;;',
    ';;Jan;Feb;Mar;Apr;May;Jun;Jul;Aug;Sep;Oct;Nov;Dec',
    'Income;Salary;3000;3000;3000;3000;3000;3000;3000;3000;3000;3000;3000;3000',
    ';Freelance;;500;;;;;;;;;;',
    'Savings;Emergency fund;200;200;;;;;;;;;;',
    'Fixed expenses;;;;;;;;;;;;;',
    'Habitation;Rent;900;900;900;900;900;900;900;900;900;900;900;900',
    ';Electricity;60;55;-10;;;;;;;;;',
    'Fixed expenses Total;;960;955;890;;;;;;;;;',
    'Variable expenses;;;;;;;;;;;;;',
    'Food;Supermarket;300;280;;;;;;;;;;',
  ].join('\n');
  const r = await analyze('budget.csv', csv);
  assert.equal(r.sheets[0].shape, 'grid');
  assert.equal(r.sheets[0].year, '2025');
  const pick = (item, mi) => r.candidates.find((c) => c.fileItem === item && c.source.month === mi);
  assert.deepEqual([pick('Salary', 0).type, pick('Salary', 0).date, pick('Salary', 0).amount], ['income', '2025-01-01', 3000]);
  assert.equal(pick('Freelance', 1).type, 'income');
  assert.equal(pick('Emergency fund', 0).type, 'investment');
  assert.deepEqual([pick('Rent', 11).type, pick('Rent', 11).group, pick('Rent', 11).fileCategory], ['expense', 'Fixed', 'Habitation']);
  assert.equal(pick('Electricity', 1).fileCategory, 'Habitation');
  assert.ok(pick('Electricity', 2).flags.includes('negative'));
  assert.deepEqual([pick('Supermarket', 0).group, pick('Supermarket', 0).fileCategory], ['Variable', 'Food']);
  assert.equal(r.candidates.filter((c) => /total/i.test(c.description)).length, 0);
  assert.equal(r.candidates.length, 12 + 1 + 2 + 12 + 3 + 2);
});

test('grid without a year: flagged and blocked until the user picks it', async () => {
  const r = await analyze('plan.csv', 'Item,Jan,Feb,Mar,Apr,May,Jun\nRent,900,900,,,,');
  assert.ok(r.warnings.some((w) => w.code === 'no_year'));
  assert.equal(r.candidates[0].date, null);
  assert.ok(rowProblems(r.candidates[0]).includes('date'));
});

test('XLSX: shared strings, date-formatted cells, several sheets of different shapes', async () => {
  const shared = ['Date', 'Description', 'Amount', 'Lidl', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Rent', 'Fixed expenses', 'Habitation'];
  const tx = '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>'
    + '<row r="2"><c r="A2" s="1"><v>46279</v></c><c r="B2" t="s"><v>3</v></c><c r="C2" s="2"><v>-23.4</v></c></row>'
    + '<row r="3"><c r="A3" s="1"><v>46280</v></c><c r="B3" t="inlineStr"><is><t>Salary &amp; bonus</t></is></c><c r="C3"><v>2000</v></c></row>';
  const grid = '<row r="1"><c r="C1" t="s"><v>4</v></c><c r="D1" t="s"><v>5</v></c><c r="E1" t="s"><v>6</v></c><c r="F1" t="s"><v>7</v></c><c r="G1" t="s"><v>8</v></c><c r="H1" t="s"><v>9</v></c></row>'
    + '<row r="2"><c r="A2" t="s"><v>11</v></c></row>'
    + '<row r="3"><c r="A3" t="s"><v>12</v></c><c r="B3" t="s"><v>10</v></c><c r="C3"><v>850</v></c><c r="D3"><v>850</v></c></row>';
  const book = await readFile('money.xlsx', xlsx([{ name: 'Movements', xml: tx }, { name: '2024', xml: grid }, { name: 'Empty', xml: '' }], shared));
  const r = analyzeWorkbook(book, { fileName: 'money.xlsx' });
  assert.deepEqual(r.sheets.map((s) => [s.name, s.shape]), [['Movements', 'transactions'], ['2024', 'grid'], ['Empty', 'empty']]);
  const lidl = r.candidates.find((c) => c.description === 'Lidl');
  assert.deepEqual([lidl.date, lidl.amount, lidl.type], ['2026-09-14', 23.4, 'expense']);
  assert.equal(r.candidates.find((c) => c.description === 'Salary & bonus').type, 'income');
  const rent = r.candidates.filter((c) => c.fileItem === 'Rent');
  assert.deepEqual(rent.map((c) => c.date), ['2024-01-01', '2024-02-01']);
  assert.deepEqual([rent[0].group, rent[0].fileCategory], ['Fixed', 'Habitation']);
});

test('unsupported and broken files give clear errors', async () => {
  await assert.rejects(readFile('old.xls', enc('x')), (e) => e instanceof ImportError && e.code === 'old_excel');
  await assert.rejects(readFile('broken.xlsx', new Uint8Array([0x50, 0x4b, 1, 2, 3])), (e) => e instanceof ImportError && e.code === 'bad_file');
  const r = await analyze('notes.txt', 'just some text\nwithout numbers');
  assert.ok(r.warnings.some((w) => w.code === 'nothing_found' || w.code === 'no_columns'));
});

test('duplicates: same date+amount+description, or same month+amount+item for grids', async () => {
  const r = await analyze('m.csv', 'Fecha;Concepto;Importe\n14/09/2026;Mercadona;-62,38\n15/09/2026;Lidl;-10,00');
  const n = markDuplicates(r.candidates, [{ date: '2026-09-14', amount: 62.38, description: 'MERCADONA', item: 'Supermarket' }]);
  assert.equal(n, 1);
  assert.ok(r.candidates[0].skip && r.candidates[0].flags.includes('duplicate'));
  assert.ok(!r.candidates[1].skip);
  const g = await analyze('g.csv', 'Item;Jan;Feb;Mar;Apr;May;Jun\nFixed expenses\nRent;900;900;;;;');
  const gName = { ...g }; // grid has no year -> no dates -> never matched
  assert.equal(markDuplicates(gName.candidates, [{ date: '2026-01-01', amount: 900, description: 'Imported', item: 'Rent' }]), 0);
});

const TAX = {
  incomes: ['Salary', 'Others'], investments: ['Savings account'],
  expenses: { Fixed: { Habitation: ['Rent', 'Eletricity'] }, Variable: { Food: ['Supermarket', 'Lunch'] } },
};

test('categorizing: merchants grouped once, prompt lists the taxonomy, only valid suggestions applied', async () => {
  const r = await analyze('m.csv', 'Fecha;Concepto;Importe\n14/09/2026;MERCADONA 1234 BCN;-62,38\n16/09/2026;Mercadona 998 bcn;-12,00\n17/09/2026;NOMINA;2.000,00\n18/09/2026;Weird shop;-5,00');
  assert.equal(merchantKey('MERCADONA 1234 BCN'), merchantKey('Mercadona 998 bcn'));
  const groups = groupForCategorizing(r.candidates);
  assert.equal(groups.length, 3);
  const batches = batchGroups(groups, 60);
  assert.ok(batches.length >= 2 && batches.flat().length === 3);
  const prompt = buildCategorizePrompt(groups, TAX);
  assert.match(prompt, /Habitation: Rent \| Eletricity/);
  assert.match(prompt, /INCOME items: Salary \| Others/);
  assert.ok(prompt.length < 70000);
  const merca = groups.find((g) => /mercadona/i.test(g.text)), nomina = groups.find((g) => g.text === 'NOMINA'), weird = groups.find((g) => g.text === 'Weird shop');
  const answer = 'Sure:\n```json\n' + JSON.stringify([
    { id: merca.k, type: 'expense', group: 'Variable', category: 'Food', item: 'Supermarket' },
    { id: nomina.k, type: 'income', group: null, category: null, item: 'Salary' },
    { id: weird.k, type: 'expense', group: 'Variable', category: 'Food', item: 'Invented item' },
  ]) + '\n```';
  const applied = applySuggestions(r.candidates, groups, parseAiJson(answer), TAX);
  assert.equal(applied, 3);
  const [m1, m2, n, w] = r.candidates;
  assert.deepEqual([m1.group, m1.category, m1.item, m2.item], ['Variable', 'Food', 'Supermarket', 'Supermarket']);
  assert.deepEqual([n.type, n.group, n.category, n.item], ['income', null, null, 'Salary']);
  assert.equal(w.item, null);
  assert.deepEqual(rowProblems(m1), []);
  assert.ok(rowProblems(w).includes('item'));
  assert.deepEqual(parseAiJson('no json here'), []);
});

test('toEntryDoc produces the app entry shape', () => {
  const c = { date: '2026-09-14', amount: 62.384, type: 'expense', group: 'Variable', category: 'Food', item: 'Supermarket', description: ' MERCADONA ', flags: [] };
  assert.deepEqual(toEntryDoc(c, 'NOW'), { year: '2026', monthIndex: 8, type: 'expense', group: 'Variable', category: 'Food', item: 'Supermarket', description: 'MERCADONA', amount: 62.38, date: '2026-09-14', createdAt: 'NOW', source: 'import' });
});
