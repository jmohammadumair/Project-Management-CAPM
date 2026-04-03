using my.projectmanager as db from '../db/schema';
// OData V4 Service definition mapping to Postgres DB tables
@path: '/browse'
service ProjectManagerService {
    // Main Projections
    entity Projects as projection on db.Projects;
    entity Resources as projection on db.Resources;
    entity Allocations as projection on db.Allocations;
    
    // Flat access to compositions for easier UI5 List Binding/Filters if needed
    entity ProjectRoles as projection on db.ProjectRoles;
    entity ResourceRoles as projection on db.ResourceRoles;
    // Optional Analytical View for Projections (Can offload frontend calculation to DB)
    @readonly
    view Analytics_Cost_Consumption as select from Allocations {
        key project.ID as projectId,
        project.name as projectName,
        project.budget as projectBudget,
        cast(sum(hours * resource.hourlyRate) as Decimal(15,2)) as consumedCost
    } group by project.ID, project.name, project.budget;
    // --- NEW: Templates & Work Breakdown Structure (WBS) ---
    
    // The main Templates entity
    entity Templates as projection on db.Templates;
    
    // Phases inside a template
    entity TemplatePhases as projection on db.TemplatePhases;
    
    // Tasks inside a Phase
    entity TemplateTasks as projection on db.TemplateTasks;
    
    // WBS Tasks for a specific project
    entity WBSTasks as projection on db.WBSTasks;
}