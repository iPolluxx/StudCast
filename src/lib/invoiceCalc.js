'use strict';

function calculateInvoice({ total_amount, approved_co_total, deposit_amount }) {
    return {
        balance_due: Math.max(0, total_amount + approved_co_total - deposit_amount),
    };
}

module.exports = { calculateInvoice };
