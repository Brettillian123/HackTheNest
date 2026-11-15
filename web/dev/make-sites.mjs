// Generates the multi-page challenges: one reference document per site in web/data/goals/ and the
// entries in web/data/challenges.json. Run: node web/dev/make-sites.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const SITES = [
  { slug: 'tutorial-two-pages', title: 'Tutorial 4: Two pages', level: 1, brand: 'Pebble', bg: '#f4f6f8', ink: '#1f2933', accent: '#2563eb', font: 'Arial, sans-serif',
    brief: 'For your first multi-page practice, make a tiny two-page site for Pebble, a note-taking app. The Home page says what it is and the About page says who makes it. The menu at the top switches between the two pages.',
    footer: 'Pebble, made in Lisbon.',
    pages: [
      ['home', 'Home', [['hero', 'Notes that stay out of your way', 'Pebble is a quiet place to write things down.', 'Read about us']]],
      ['about', 'About', [['text', 'About Pebble', 'Two friends build Pebble in a small office in Lisbon.'], ['list', 'What we care about', ['Fast to open', 'Easy to read', 'Yours to keep']]]],
    ] },
  { slug: 'cafe-site', title: 'Cafe site', level: 1, brand: 'Juniper Cafe', bg: '#faf6ef', ink: '#2b2118', accent: '#b4532a', font: 'Georgia, serif',
    brief: 'We need a small website for Juniper Cafe, a neighbourhood coffee shop. People look us up to see what we serve and when we are open, so the site has a welcoming Home page, a Menu page with prices and a Visit page with our hours and address.',
    footer: 'Juniper Cafe, 14 Alder Street. Open every day.',
    pages: [
      ['home', 'Home', [['hero', 'Coffee worth the walk', 'Small-batch roasts and fresh pastries, baked here every morning.', 'See the menu'], ['cards', [['Roasted weekly', 'Beans from two farms we know by name.'], ['Baked daily', 'Croissants out of the oven at 7 am.'], ['Dogs welcome', 'Water bowls by the door.']]]]],
      ['menu', 'Menu', [['table', 'Menu', ['Item', 'Price'], [['Espresso', '$3.00'], ['Flat white', '$4.25'], ['Oat latte', '$4.75'], ['Butter croissant', '$3.50'], ['Cinnamon bun', '$4.00']]]]],
      ['visit', 'Visit', [['text', 'Visit us', '14 Alder Street, two doors down from the library.'], ['list', 'Opening hours', ['Monday to Friday: 7 am to 5 pm', 'Saturday: 8 am to 4 pm', 'Sunday: 9 am to 2 pm']]]],
    ] },
  { slug: 'dog-walker-site', title: 'Dog walker site', level: 1, brand: 'Pawpath', bg: '#f3f8f4', ink: '#1c2b22', accent: '#2f855a', font: 'Arial, sans-serif',
    brief: 'Pawpath is a one-person dog walking business and needs a simple site. Owners want to know what walks are on offer and how to get in touch, so there is a Home page, a Services page with three walks and their prices, and a Contact page with a short form.',
    footer: 'Pawpath dog walking, Portland. Insured and first-aid trained.',
    pages: [
      ['home', 'Home', [['hero', 'Happy dogs, every weekday', 'Friendly group and solo walks around Laurelhurst Park.', 'See services'], ['stats', [['6', 'years walking'], ['40+', 'regular dogs'], ['5.0', 'average review']]]]],
      ['services', 'Services', [['prices', [['Quick stroll', '$15', ['20 minutes', 'Solo walk'], 'Book a stroll'], ['Park hour', '$25', ['60 minutes', 'Group of four'], 'Book an hour'], ['Day out', '$60', ['4 hours', 'Trail hike'], 'Book a day']]]]],
      ['contact', 'Contact', [['form', 'Say hello', ['Your name', 'Email', "Your dog's name"], 'Send message'], ['text', 'Prefer to call?', 'Ring Sam on 503 555 0142 between 8 am and 6 pm.']]],
    ] },
  { slug: 'band-site', title: 'Band site', level: 1, brand: 'The Lanterns', bg: '#15131a', ink: '#f3eefc', accent: '#f59e0b', font: 'Arial, sans-serif', dark: true,
    brief: 'The Lanterns are a four-piece folk band with a new record out. Fans come to hear about the album and find a show near them, so the site is two pages: Home, about the new record, and Shows, a table of tour dates. It is a dark site with warm amber accents.',
    footer: 'The Lanterns. Booking: hello@thelanterns.example',
    pages: [
      ['home', 'Home', [['hero', 'New album: Slow Rivers', 'Ten songs recorded live in a barn over one week in March.', 'Find a show'], ['cards', [['Listen', 'Out now on every streaming service.'], ['Vinyl', 'A limited run of 500 amber records.']]]]],
      ['shows', 'Shows', [['table', 'Tour dates', ['Date', 'City', 'Venue'], [['May 3', 'Asheville', 'The Grey Eagle'], ['May 5', 'Nashville', 'The Basement'], ['May 9', 'Chicago', 'Schubas'], ['May 12', 'Minneapolis', 'Turf Club']]]]],
    ] },
  { slug: 'yoga-studio-site', title: 'Yoga studio site', level: 2, brand: 'Stillwater Yoga', bg: '#f7f5f2', ink: '#27303a', accent: '#0f766e', font: 'Georgia, serif',
    brief: 'Stillwater Yoga is opening a second room and wants a proper website. New students need to see what a week looks like, what it costs and how to sign up, so the site has four pages: Home, Classes with the weekly timetable, Pricing with three passes, and Contact with a sign-up form.',
    footer: 'Stillwater Yoga, 8 Mill Lane, Bristol. Mats and blocks provided.',
    pages: [
      ['home', 'Home', [['hero', 'Slow down, breathe out', 'Small classes for every body, seven days a week.', 'See the timetable'], ['cards', [['Beginners welcome', 'Every class has an easier option.'], ['Twelve mats', 'Rooms are never crowded.'], ['First class free', 'Come and try before you buy.']]]]],
      ['classes', 'Classes', [['table', 'Weekly timetable', ['Day', 'Time', 'Class', 'Teacher'], [['Monday', '7:00 am', 'Morning flow', 'Priya'], ['Tuesday', '6:30 pm', 'Yin', 'Tomas'], ['Wednesday', '12:15 pm', 'Lunch stretch', 'Priya'], ['Thursday', '6:30 pm', 'Power flow', 'Anika'], ['Saturday', '9:00 am', 'Family yoga', 'Tomas']]]]],
      ['pricing', 'Pricing', [['prices', [['Drop in', '£12', ['One class', 'No booking fee'], 'Buy a class'], ['Ten pass', '£95', ['Ten classes', 'Valid six months'], 'Buy a pass'], ['Unlimited', '£65 a month', ['Every class', 'Cancel any time'], 'Join now']]]]],
      ['contact', 'Contact', [['form', 'Book your free class', ['Full name', 'Email address', 'Which class?'], 'Request a place'], ['text', 'Find us', 'Up the stairs beside the bakery on Mill Lane.']]],
    ] },
  { slug: 'app-landing-site', title: 'App landing site', level: 2, brand: 'Ledgerly', bg: '#f5f7fb', ink: '#111827', accent: '#4f46e5', font: 'Arial, sans-serif',
    brief: 'Ledgerly is invoicing software for freelancers and the team wants a marketing site. A freelancer should understand what it does, see the main features, compare plans and get common questions answered. That makes four pages: Home, Features, Pricing and FAQ.',
    footer: 'Ledgerly Inc. Invoices sent in under a minute.',
    pages: [
      ['home', 'Home', [['hero', 'Get paid without the paperwork', 'Send an invoice in under a minute and let Ledgerly chase it for you.', 'Start free'], ['stats', [['38,000', 'freelancers'], ['$210M', 'invoiced last year'], ['9 days', 'average time to paid']]]]],
      ['features', 'Features', [['cards', [['One-minute invoices', 'Pick a client, add a line, press send.'], ['Automatic reminders', 'Polite nudges at 7, 14 and 30 days.'], ['Card and bank payments', 'Clients pay from the invoice itself.'], ['Tax-ready reports', 'Export a full year in one click.']]]]],
      ['pricing', 'Pricing', [['prices', [['Solo', '$0', ['3 clients', 'Unlimited invoices'], 'Start free'], ['Studio', '$12 a month', ['Unlimited clients', 'Automatic reminders'], 'Choose Studio'], ['Agency', '$29 a month', ['Five team seats', 'Priority support'], 'Choose Agency']]]]],
      ['faq', 'FAQ', [['text', 'Is there a contract?', 'No. Pay monthly and leave whenever you like.'], ['text', 'Which currencies work?', 'Invoice in any of 32 currencies.'], ['text', 'Can I import clients?', 'Yes, upload a spreadsheet and we do the rest.']]],
    ] },
  { slug: 'bookshop-site', title: 'Bookshop site', level: 2, brand: 'Marlowe Books', bg: '#fbf8f1', ink: '#2a1f14', accent: '#8b1e3f', font: 'Georgia, serif',
    brief: 'Marlowe Books is an independent bookshop that wants a site with some character. Readers come for recommendations and for our events, so there are four pages: Home, Staff picks with four books, Events with the month ahead, and About with our story and hours.',
    footer: 'Marlowe Books, 3 Quay Road, Galway. Independent since 1987.',
    pages: [
      ['home', 'Home', [['hero', 'A bookshop for the curious', 'Three floors of new and second-hand books by the harbour.', 'See staff picks'], ['cards', [['New this week', 'Forty fresh titles on the front table.'], ['Second-hand', 'A whole floor of pre-loved paperbacks.']]]]],
      ['picks', 'Staff picks', [['cards', [['The Salt Path', 'Chosen by Niamh: a walk that changes everything.'], ['Piranesi', 'Chosen by Owen: strange, short and perfect.'], ['Small Things Like These', 'Chosen by Aoife: one evening, one hard choice.'], ['The Overstory', 'Chosen by Dara: you will look at trees differently.']]]]],
      ['events', 'Events', [['table', 'This month', ['Date', 'Event', 'Time'], [['June 4', 'Poetry open mic', '7:00 pm'], ['June 11', 'Crime fiction club', '6:30 pm'], ['June 18', 'Author evening: Claire Keegan', '7:30 pm'], ['June 25', "Children's story hour", '11:00 am']]]]],
      ['about', 'About', [['text', 'Our story', 'Marlowe Books opened in 1987 in a former sail loft and has never moved.'], ['list', 'Opening hours', ['Monday to Saturday: 9:30 am to 6 pm', 'Sunday: 12 pm to 5 pm']]]],
    ] },
  { slug: 'agency-site', title: 'Design agency site', level: 3, brand: 'Northlight Studio', bg: '#0f1115', ink: '#eef0f4', accent: '#ff5a3c', font: 'Arial, sans-serif', dark: true,
    brief: 'Northlight Studio is a brand and web design agency pitching for bigger clients, and the site has to show range. A prospect should see recent work, what we offer, who they would work with and how to start a project. Five pages: Home, Work, Services, Team and Contact, on a dark background with a hot orange accent.',
    footer: 'Northlight Studio, Rotterdam. hello@northlight.example',
    pages: [
      ['home', 'Home', [['hero', 'Brands people remember', 'We design identities and websites for companies that want to be noticed.', 'See our work'], ['stats', [['120', 'projects shipped'], ['14', 'people'], ['9', 'design awards']]], ['cards', [['Strategy first', 'Every project starts with a week of listening.'], ['Built in-house', 'Design and code under one roof.']]]]],
      ['work', 'Work', [['cards', [['Halden Bank', 'Identity and app for a digital bank.'], ['Fjord Coffee', 'Packaging for a roastery in Bergen.'], ['Atlas Cycles', 'Online shop for a bike maker.'], ['Museum Noord', 'Wayfinding and ticketing site.']]]]],
      ['services', 'Services', [['prices', [['Brand sprint', 'from €8,000', ['Two weeks', 'Logo and guidelines'], 'Plan a sprint'], ['Website', 'from €18,000', ['Eight weeks', 'Design and build'], 'Plan a website'], ['Retainer', '€4,500 a month', ['Ongoing design', 'Monthly review'], 'Talk retainers']]]]],
      ['team', 'Team', [['table', 'The people you work with', ['Name', 'Role', 'Joined'], [['Ines Vermeer', 'Creative director', '2016'], ['Kofi Mensah', 'Lead developer', '2018'], ['Sanne de Wit', 'Brand strategist', '2019'], ['Luca Romano', 'Motion designer', '2022']]]]],
      ['contact', 'Contact', [['form', 'Start a project', ['Your name', 'Company', 'Email', 'Budget range'], 'Send brief'], ['text', 'Visit the studio', 'Schiekade 105, Rotterdam. Coffee is always on.']]],
    ] },
  { slug: 'dental-clinic-site', title: 'Dental clinic site', level: 3, brand: 'Oakfield Dental', bg: '#f4f9fb', ink: '#17303b', accent: '#0e7490', font: 'Arial, sans-serif',
    brief: 'Oakfield Dental is a family practice that wants a calm, clear website. Patients need to see what we treat, what it costs, who will look after them and how to book. Five pages: Home, Treatments, Fees with a price table, Team and Book with an appointment form.',
    footer: 'Oakfield Dental, 22 Station Road, Leeds. Emergency line: 0113 555 0190.',
    pages: [
      ['home', 'Home', [['hero', 'Gentle dentistry for the whole family', 'Same-week appointments and clear prices before any treatment.', 'Book an appointment'], ['stats', [['4', 'dentists'], ['12,000', 'patients'], ['4.9', 'patient rating']]], ['cards', [['Nervous patients', 'Longer slots and no rush.'], ['Children', 'Free check-ups under 18.'], ['Emergencies', 'Seen the same day.']]]]],
      ['treatments', 'Treatments', [['cards', [['Check-ups', 'A full exam and clean every six months.'], ['Fillings', 'Tooth-coloured and done in one visit.'], ['Whitening', 'Custom trays to use at home.'], ['Braces', 'Clear aligners for teens and adults.']]]]],
      ['fees', 'Fees', [['table', 'Fee guide', ['Treatment', 'Time', 'Fee'], [['New patient exam', '40 min', '£55'], ['Hygienist visit', '30 min', '£62'], ['White filling', '45 min', '£110'], ['Home whitening', '2 visits', '£295'], ['Clear aligners', '9 months', '£2,400']]], ['text', 'Payment plans', 'Spread any treatment over £300 across twelve months at no interest.']]],
      ['team', 'Team', [['cards', [['Dr Hannah Reid', 'Principal dentist, here since 2009.'], ['Dr Amir Qureshi', 'Dentist with a special interest in braces.'], ['Lucy Barker', 'Hygienist and gum health lead.'], ['Tom Ellis', 'Practice manager.']]]]],
      ['book', 'Book', [['form', 'Request an appointment', ['Full name', 'Phone number', 'Preferred day', 'What do you need?'], 'Request appointment'], ['list', 'Opening hours', ['Monday to Thursday: 8 am to 6 pm', 'Friday: 8 am to 4 pm', 'Saturday: 9 am to 1 pm']]]],
    ] },
  { slug: 'api-docs-site', title: 'API product site', level: 3, brand: 'Relay API', bg: '#fafafa', ink: '#18181b', accent: '#7c3aed', font: '"Courier New", monospace',
    brief: 'Relay is an API for sending text messages and the developer site needs to sell and explain it at once. A developer should grasp the product, send a first message, look up the endpoints, check the price and see what changed lately. Five pages: Home, Quickstart, Reference, Pricing and Changelog, in a monospace look.',
    footer: 'Relay API. Status: all systems normal.',
    pages: [
      ['home', 'Home', [['hero', 'Send a text with one request', 'A messaging API with delivery in 190 countries and no monthly minimum.', 'Read the quickstart'], ['stats', [['99.99%', 'uptime'], ['1.2 s', 'median delivery'], ['190', 'countries']]]]],
      ['quickstart', 'Quickstart', [['list', 'Send your first message', ['Create an API key in the dashboard', 'POST to /v1/messages with a number and a body', 'Read the delivery status from the response']], ['text', 'Test mode', 'Keys that start with test_ never send a real message.']]],
      ['reference', 'Reference', [['table', 'Endpoints', ['Method', 'Path', 'What it does'], [['POST', '/v1/messages', 'Send a message'], ['GET', '/v1/messages/:id', 'Read one message'], ['GET', '/v1/messages', 'List messages'], ['POST', '/v1/numbers', 'Rent a number'], ['DELETE', '/v1/numbers/:id', 'Release a number']]]]],
      ['pricing', 'Pricing', [['prices', [['Pay as you go', '$0.008 a message', ['No minimum', 'Email support'], 'Create a key'], ['Scale', '$400 a month', ['75,000 messages', 'Chat support'], 'Choose Scale'], ['Enterprise', 'Custom', ['Volume pricing', 'Named engineer'], 'Contact sales']]]]],
      ['changelog', 'Changelog', [['table', 'Recent changes', ['Version', 'Date', 'Change'], [['2.4', 'April 22', 'Scheduled sending'], ['2.3', 'March 30', 'Delivery webhooks retry for 24 hours'], ['2.2', 'March 4', 'Alphanumeric sender names'], ['2.1', 'February 11', 'Faster number search']]]]],
    ] },
];

function build(site) {
  const texts = new Set();
  const t = s => { texts.add(s); return esc(s); };
  const notes = {};
  const block = (b, pageId) => {
    const add = d => (notes[pageId] ||= []).push(d);
    const [type] = b;
    if (type === 'hero') { add(`a large heading "${b[1]}", one line of supporting text and a "${b[3]}" button that links to another page`); return `<div class="hero"><h1>${t(b[1])}</h1><p>${t(b[2])}</p><a class="btn" href="#${site.pages[1][0]}">${t(b[3])}</a></div>`; }
    if (type === 'cards') { add(`a row of ${b[1].length} equal cards, each with a title and one line of text`); return `<div class="row">${b[1].map(c => `<div class="card"><h3>${t(c[0])}</h3><p>${t(c[1])}</p></div>`).join('')}</div>`; }
    if (type === 'stats') { add(`a row of ${b[1].length} figures, each a big number over a small label`); return `<div class="row">${b[1].map(c => `<div class="stat"><b>${t(c[0])}</b><span>${t(c[1])}</span></div>`).join('')}</div>`; }
    if (type === 'table') { add(`a heading "${b[1]}" over a table with the columns ${b[2].join(', ')} and ${b[3].length} rows`); return `<h2>${t(b[1])}</h2><table><thead><tr>${b[2].map(h => `<th>${t(h)}</th>`).join('')}</tr></thead><tbody>${b[3].map(r => `<tr>${r.map(c => `<td>${t(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`; }
    if (type === 'text') { add(`a heading "${b[1]}" with one paragraph under it`); return `<h2>${t(b[1])}</h2><p>${t(b[2])}</p>`; }
    if (type === 'list') { add(`a heading "${b[1]}" over a list of ${b[2].length} items`); return `<h2>${t(b[1])}</h2><ul>${b[2].map(i => `<li>${t(i)}</li>`).join('')}</ul>`; }
    if (type === 'form') { add(`a form headed "${b[1]}" with the labelled fields ${b[2].join(', ')} and a "${b[3]}" button`); return `<h2>${t(b[1])}</h2><form>${b[2].map((l, i) => `<label for="${pageId}-f${i}">${t(l)}</label><input id="${pageId}-f${i}" type="text">`).join('')}<button type="button" class="btn">${t(b[3])}</button></form>`; }
    if (type === 'prices') { add(`${b[1].length} price cards side by side, each with a name, a price, two points and a button`); return `<div class="row">${b[1].map(c => `<div class="card price"><h3>${t(c[0])}</h3><div class="amt">${t(c[1])}</div><ul>${c[2].map(i => `<li>${t(i)}</li>`).join('')}</ul><a class="btn" href="#${site.pages[site.pages.length - 1][0]}">${t(c[3])}</a></div>`).join('')}</div>`; }
    throw new Error(type);
  };
  const home = site.pages[0][0];
  const panel = site.dark ? '#1c1f27' : '#ffffff';
  const line = site.dark ? '#2c303b' : '#e2e4e8';
  const muted = site.dark ? '#a4a9b6' : '#5b6470';
  const section = p => `<section class="page" id="${p[0]}">\n${p[2].map(b => block(b, p[0])).join('\n')}\n</section>`;
  // The home section goes last so the :target rule can hide it when another page is open.
  const sections = [...site.pages.slice(1), site.pages[0]].map(section).join('\n');
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${t(site.brand)}</title>
<style>
*{box-sizing:border-box}
body{margin:0;background:${site.bg};color:${site.ink};font:16px/1.5 ${site.font}}
header{display:flex;align-items:center;justify-content:space-between;padding:20px 64px;border-bottom:1px solid ${line}}
.brand{font-size:22px;font-weight:bold}
nav a{margin-left:28px;color:${site.ink};text-decoration:none;font-size:16px}
nav a:hover{color:${site.accent}}
.page{display:none;max-width:1040px;margin:0 auto;padding:48px 32px;min-height:560px}
.page:target{display:block}
#${home}{display:block}
.page:target~#${home}{display:none}
.hero{padding:40px 0 48px}
h1{font-size:52px;line-height:1.1;margin:0 0 16px;max-width:720px}
h2{font-size:28px;margin:0 0 16px}
h3{font-size:19px;margin:0 0 8px}
p{margin:0 0 20px;color:${muted};max-width:640px}
.hero p{font-size:20px}
.btn{display:inline-block;background:${site.accent};color:#ffffff;border:0;border-radius:6px;padding:12px 22px;font:bold 16px ${site.font};text-decoration:none;cursor:pointer}
.row{display:flex;gap:20px;margin:0 0 32px}
.card,.stat{flex:1;background:${panel};border:1px solid ${line};border-radius:10px;padding:22px}
.card p{margin:0}
.stat b{display:block;font-size:34px;color:${site.accent}}
.stat span{color:${muted};font-size:14px}
.amt{font-size:26px;font-weight:bold;color:${site.accent};margin:0 0 12px}
.price ul{margin:0 0 18px;padding-left:18px;color:${muted}}
table{width:100%;border-collapse:collapse;margin:0 0 32px;background:${panel};border:1px solid ${line}}
th,td{text-align:left;padding:12px 16px;border-bottom:1px solid ${line}}
th{font-size:13px;text-transform:uppercase;letter-spacing:1px;color:${muted}}
ul{margin:0 0 28px;padding-left:20px}
li{margin:0 0 6px}
form{max-width:440px;margin:0 0 36px}
label{display:block;font-weight:bold;font-size:14px;margin:0 0 6px}
input{display:block;width:100%;padding:10px 12px;margin:0 0 16px;border:1px solid ${line};border-radius:6px;background:${panel};color:${site.ink};font:16px ${site.font}}
footer{padding:24px 64px;border-top:1px solid ${line};color:${muted};font-size:14px}
</style>
</head>
<body>
<header><div class="brand">${t(site.brand)}</div><nav>${site.pages.map(p => `<a href="#${p[0]}">${t(p[1])}</a>`).join('')}</nav></header>
${sections}
<footer>${t(site.footer)}</footer>
</body>
</html>
`;
  const pageNames = site.pages.map(p => p[1]);
  const keyFacts = [...texts];
  const sorted = keyFacts.slice().sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
  const reqs = [
    ['content', true, `The site has ${site.pages.length} pages: ${pageNames.join(', ')}`],
    ['structure', true, `A shared header on every page shows the name ${site.brand} on the left and a menu on the right with the links ${pageNames.join(', ')}, in that order`],
    ['behaviour', false, 'Each menu link opens its page, and only one page shows at a time'],
    ['content', true, `A shared footer on every page reads: ${site.footer}`],
    ...site.pages.map(p => ['structure', false, `The ${p[1]} page has ${notes[p[0]].join('; then ')}`]),
    ['style', false, `Page background ${site.bg}, text ${site.ink}, and one accent colour ${site.accent} used for buttons and figures`],
    ['engineering', false, 'Every form field has a visible label, and headings go in order without skipping a level'],
  ];
  const n = site.pages.length;
  return {
    html,
    entry: {
      slug: site.slug,
      title: site.title,
      level: site.level,
      category: 'Sites with several pages',
      brief: site.brief,
      acceptance: [
        `The site has ${n} pages (${pageNames.join(', ')}) and the menu switches between them`,
        'The header and footer are the same on every page',
        'Every text on every page is spelled exactly as given',
        'Put side by side with the reference, each page is hard to tell apart',
      ],
      content: `Every text on the site, spelled exactly, in alphabetical order (the order says nothing about which page a text is on or where it goes):\n${sorted.map(x => `- ${x}`).join('\n')}`,
      pages: site.pages.map((p, i) => ({ id: p[0], path: i === 0 ? 'index.html' : `${p[0]}.html`, title: p[1] })),
      requirements: reqs.map((r, i) => ({ id: `r${i + 1}`, text: r[2], kind: r[0], exact: r[1] })),
      keyFacts,
      designNotes: [
        `Font family ${site.font}; the main heading is about 52px, section headings about 28px`,
        `Content sits in a centred column about 1040px wide with 48px of space above it`,
        `Cards have a 1px border, 10px rounded corners and 22px of padding, in a row with 20px gaps`,
        `Buttons are solid ${site.accent} with white bold text and 6px rounded corners`,
      ],
      maxPromptChars: [0, 6000, 8000, 10000][site.level],
      maxOutputTokens: [0, 6000, 7500, 9000][site.level],
    },
  };
}

const file = new URL('../data/challenges.json', import.meta.url);
const data = JSON.parse(readFileSync(file, 'utf8'));
const slugs = new Set(SITES.map(s => s.slug));
data.challenges = data.challenges.filter(c => !slugs.has(c.slug));
for (const site of SITES) {
  const { html, entry } = build(site);
  writeFileSync(new URL(`../data/goals/${site.slug}.html`, import.meta.url), html);
  // The tutorial sits with the other tutorials at the front; the rest go at the end.
  if (site.slug.startsWith('tutorial-')) {
    const last = data.challenges.map(c => c.slug.startsWith('tutorial-')).lastIndexOf(true);
    data.challenges.splice(last + 1, 0, entry);
  } else data.challenges.push(entry);
  console.log(site.slug, site.pages.length, 'pages', html.length, 'bytes', entry.keyFacts.length, 'texts');
}
writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
