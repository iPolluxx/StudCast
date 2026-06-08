'use strict';

const { calculateInvoice } = require('../src/lib/invoiceCalc');

test('standard: total + CO - deposit = balance_due', () => {
    expect(calculateInvoice({ total_amount: 2000, approved_co_total: 500, deposit_amount: 300 }))
        .toEqual({ balance_due: 2200 });
});

test('no deposit or COs: total passes through', () => {
    expect(calculateInvoice({ total_amount: 1500, approved_co_total: 0, deposit_amount: 0 }))
        .toEqual({ balance_due: 1500 });
});

test('over-deposited: balance_due clamped to 0', () => {
    expect(calculateInvoice({ total_amount: 1000, approved_co_total: 0, deposit_amount: 1200 }))
        .toEqual({ balance_due: 0 });
});
