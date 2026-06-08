#!/usr/bin/env node
// One-time script to seed the employer demo account in Firestore.
// Run: node scripts/seed-demo-account.js
// Safe to re-run — uses set() with merge:false so it overwrites cleanly.

const { Firestore } = require('@google-cloud/firestore');

const PROJECT_ID   = 'mightdoit';
const DEMO_PHONE   = '+10000000001';
const DEMO_EMAIL   = 'studcastdemo@gmail.com';
const DEMO_COMPANY = 'Demo Contractor';

const db = new Firestore({ projectId: PROJECT_ID });

async function main() {
  // 1. Root user document (resolvePhoneByEmail queries users where email==)
  await db.collection('users').doc(DEMO_PHONE).set({
    companyName: DEMO_COMPANY,
    email:       DEMO_EMAIL,
    zipCode:     '90210',
    status:      'active',
  });
  console.log('✅  users/' + DEMO_PHONE);

  // 2. Settings / subscription
  await db.collection('users').doc(DEMO_PHONE)
    .collection('settings').doc('config').set({
      company_name:          DEMO_COMPANY,
      company_address:       '1200 Industrial Blvd, Los Angeles CA 90021',
      contact_email:         DEMO_EMAIL,
      license_number:        'CA-LIC-847291',
      default_labor_rate:    65,
      global_markup_percent: 12,
      tax_rate:              9.5,
      active_subscription:   true,
      subscription_status:   'active',
      isOnboarded:           true,
      estimateCount:         4,
    });
  console.log('✅  users/' + DEMO_PHONE + '/settings/config');

  // 3. Demo estimates
  const estimates = [
    {
      id: 'demo-est-001',
      doc: {
        project_name:  '24 ft Garage Addition — Frame & Sheathe',
        scope_of_work: 'Frame and sheathe a 24-foot exterior wall for a 2-car garage addition. 2x6 studs at 16" OC, treated bottom plate, OSB sheathing, 1 man-door rough opening.',
        client_name:   'Frank Deluca',
        client_address:'4481 Maple Ave, Pasadena CA 91103',
        total_amount:  2847.60,
        item_count:    9,
        updatedAt:     new Date('2026-06-03T14:22:00Z'),
        items: [
          { type:'material', name:'2x6x8 SPF Studs',       quantity:21,  unit_price:8.49,   total:178.29, price_source:'database' },
          { type:'material', name:'2x6x12 Top Plates',     quantity:4,   unit_price:14.25,  total:57.00,  price_source:'database' },
          { type:'material', name:'2x6 PT Bottom Plate',   quantity:2,   unit_price:16.80,  total:33.60,  price_source:'database' },
          { type:'material', name:'7/16" OSB Sheathing',   quantity:14,  unit_price:38.95,  total:545.30, price_source:'database' },
          { type:'material', name:'16d Framing Nails 5lb', quantity:3,   unit_price:12.40,  total:37.20,  price_source:'database' },
          { type:'material', name:'Simpson LTP4 Ties',     quantity:16,  unit_price:2.85,   total:45.60,  price_source:'ai'       },
          { type:'material', name:'Tyvek House Wrap 9x100',quantity:1,   unit_price:148.00, total:148.00, price_source:'database' },
          { type:'labor',    role:'Framing Carpenter',     hours:16,     rate:65,           total:1040.00,price_source:'database' },
          { type:'labor',    role:'Laborer / Material Handling', hours:8, rate:45,          total:360.00, price_source:'database' },
        ],
      },
    },
    {
      id: 'demo-est-002',
      doc: {
        project_name:  'Master Bath Full Remodel',
        scope_of_work: 'Demo existing tile, replace subfloor section, install cement board, lay 12x24 porcelain tile, replace toilet and vanity, repipe supply lines to PEX.',
        client_name:   'Sandra Whitmore',
        client_address:'7723 Hillcrest Dr, Burbank CA 91505',
        total_amount:  6415.80,
        item_count:    12,
        updatedAt:     new Date('2026-06-01T09:45:00Z'),
        items: [
          { type:'material', name:'12x24 Porcelain Tile',        quantity:48, unit_price:4.95,  total:237.60, price_source:'database' },
          { type:'material', name:'1/2" Cement Board 3x5',       quantity:12, unit_price:14.20, total:170.40, price_source:'database' },
          { type:'material', name:'Floor Tile Adhesive 50lb',    quantity:4,  unit_price:29.80, total:119.20, price_source:'database' },
          { type:'material', name:'Tile Grout Unsanded 25lb',    quantity:3,  unit_price:18.50, total:55.50,  price_source:'database' },
          { type:'material', name:'1/2" PEX-A Tubing 100ft',     quantity:2,  unit_price:58.00, total:116.00, price_source:'database' },
          { type:'material', name:'PEX Crimp Fittings Asst Pack', quantity:2,  unit_price:24.95, total:49.90,  price_source:'ai'       },
          { type:'material', name:'Toilet — Kohler Highline Elong.',quantity:1,unit_price:329.00,total:329.00, price_source:'override' },
          { type:'material', name:'36" Vanity w/ Sink Top',       quantity:1,  unit_price:485.00,total:485.00, price_source:'override' },
          { type:'material', name:'Subfloor Patch 3/4" Plywood',  quantity:2,  unit_price:58.75, total:117.50, price_source:'database' },
          { type:'labor',    role:'Tile Setter',                  hours:24, rate:75, total:1800.00, price_source:'database' },
          { type:'labor',    role:'Plumber',                      hours:10, rate:95, total:950.00,  price_source:'database' },
          { type:'labor',    role:'General Carpenter',            hours:14, rate:65, total:910.00,  price_source:'database' },
        ],
      },
    },
    {
      id: 'demo-est-003',
      doc: {
        project_name:  'Roof Shingle Replacement — 28 Sq',
        scope_of_work: 'Tear off existing 3-tab shingles, inspect and replace damaged decking, install ice & water shield at eaves, felt underlayment, and 30yr architectural shingles. Replace 2 pipe boots.',
        client_name:   'Marcus Bell',
        client_address:'318 Crestview Ln, Glendale CA 91208',
        total_amount:  9182.00,
        item_count:    10,
        updatedAt:     new Date('2026-05-28T16:10:00Z'),
        items: [
          { type:'material', name:'Arch Shingles 30yr (sq)',       quantity:30, unit_price:98.00,  total:2940.00, price_source:'override' },
          { type:'material', name:'15lb Felt Underlayment 4sq roll',quantity:7, unit_price:32.50,  total:227.50,  price_source:'database' },
          { type:'material', name:'Ice & Water Shield 75sf roll',  quantity:4,  unit_price:89.00,  total:356.00,  price_source:'database' },
          { type:'material', name:'Roofing Nails Coil 7200ct',     quantity:2,  unit_price:54.00,  total:108.00,  price_source:'database' },
          { type:'material', name:'Drip Edge 10ft',                quantity:14, unit_price:6.80,   total:95.20,   price_source:'database' },
          { type:'material', name:'Pipe Boot Flashing',            quantity:2,  unit_price:18.50,  total:37.00,   price_source:'database' },
          { type:'material', name:'7/16" OSB Decking (damage repair)',quantity:4,unit_price:38.95, total:155.80,  price_source:'ai'       },
          { type:'labor',    role:'Roofer — Tear-off',             hours:12, rate:58, total:696.00,  price_source:'database' },
          { type:'labor',    role:'Roofer — Install',              hours:24, rate:65, total:1560.00, price_source:'database' },
          { type:'labor',    role:'Laborer / Cleanup',             hours:8,  rate:45, total:360.00,  price_source:'database' },
        ],
      },
    },
  ];

  for (const { id, doc } of estimates) {
    await db.collection('users').doc(DEMO_PHONE)
      .collection('estimates').doc(id).set(doc);
    console.log('✅  estimate ' + id + ' — ' + doc.project_name);
  }

  console.log('\n🎉  Demo account ready.');
  console.log('    Email:   ' + DEMO_EMAIL);
  console.log('    Phone:   ' + DEMO_PHONE + '  (Firestore key — not real SMS)');
  console.log('    Sign-in: https://lone-ranger-app-879716207624.us-central1.run.app/dashboard-legacy');
}

main().catch(err => { console.error(err); process.exit(1); });
