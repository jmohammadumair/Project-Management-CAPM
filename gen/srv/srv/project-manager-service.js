const cds = require('@sap/cds');

/**
 * Controller logic for UI5 Integration
 * Handles validations, auto-calculations, and deep data structuring
 */
module.exports = cds.service.impl(async function() {

    const { Resources, Allocations } = this.entities;

    /**
     * RESOURCE HANDLER: Auto-calculate Hourly Rate
     * Triggered automatically before a Resource is saved to the Postgres Database
     */
    this.before(['CREATE', 'UPDATE'], Resources, (req) => {
        const data = req.data;
        
        // Ensure values exist (fallbacks)
        const salary = data.salary || 0;
        const officeCost = data.officeCost || 0;
        const overheadCost = data.overheadCost || 0;
        
        // If contract, wipe office and overhead costs per business rules
        if (data.type === 'Contract') {
            data.officeCost = 0;
            data.overheadCost = 0;
        }

        const totalCost = salary + (data.officeCost) + (data.overheadCost);
        
        // Formula: Base Salary + Overhead + Office / 2080 working hours
        if (totalCost > 0) {
            data.hourlyRate = Math.round(totalCost / 2080);
        } else {
            data.hourlyRate = 0;
        }
    });

    /**
     * ALLOCATION HANDLER: Validate and Sanitize
     * Ensures UI5 application doesn't submit invalid allocation data
     */
    this.before(['CREATE', 'UPDATE'], Allocations, async (req) => {
        const alloc = req.data;

        // 1. Guard check for valid hours
        if (alloc.hours === null || alloc.hours <= 0) {
            req.reject(400, 'Allocated hours must be greater than zero.');
        }

        // 2. Data consistency check (Verify resource and project exist)
        if (!alloc.project_ID || !alloc.resource_ID) {
            req.reject(400, 'Allocation must contain both a valid Project ID and Resource ID.');
        }
    });

    /**
     * ALLOCATION HANDLER: Bulk/Deep Update Simulation
     * Because the UI frontend clears old allocations and writes new ones, 
     * we can expose a custom Action here if standard OData V4 PATCH isn't enough.
     */
    this.on('UPDATE', 'Projects', async (req, next) => {
        // Let standard SAP CAP deep-update handler process the required roles and fields
        return next();
    });

});
