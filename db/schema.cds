namespace my.projectmanager;

// 1. Project Definitions
entity Projects {
    key ID          : String(10); // e.g., 'P001'
    name            : String(100);
    budget          : Decimal(15,2);
    startDate       : Date;
    endDate         : Date;
    
    // Deep composition for required roles (1-to-N)
    requiredRoles   : Composition of many ProjectRoles on requiredRoles.project = $self;
    
    // Navigational association to track actual allocations
    allocations     : Association to many Allocations on allocations.project = $self;
}

// Child entity for Project Required Roles
entity ProjectRoles {
    key ID          : UUID;
    project         : Association to Projects;
    role            : String(50);
    count           : Integer;
}

// 2. Resource Definitions & Price Profiles
entity Resources {
    key ID          : String(10); // e.g., 'R001'
    name            : String(100);
    type            : String(20); // 'Full Time' | 'Contract'
    salary          : Decimal(15,2);
    officeCost      : Decimal(15,2);
    overheadCost    : Decimal(15,2);
    hourlyRate      : Decimal(15,2); // Auto-calculated in controller
    
    // Deep composition for resource's skill set/roles
    roles           : Composition of many ResourceRoles on roles.resource = $self;
    
    // Navigational association to track where resource is deployed
    allocations     : Association to many Allocations on allocations.resource = $self;
}

// Child entity for Resource Multiple Roles
entity ResourceRoles {
    key ID          : UUID;
    resource        : Association to Resources;
    role            : String(50);
}

// 3. Allocations (Junction / Transactional Entity)
entity Allocations {
    key ID          : UUID;
    project         : Association to Projects;
    resource        : Association to Resources;
    role            : String(50); // The specific role they are fulfilling here
    hours           : Integer;
}


// --- 4. Templates & Work Breakdown Structure (WBS) ---
entity Templates {
    key ID          : String(30);
    name            : String(100);
    phases          : Composition of many TemplatePhases on phases.template = $self;
}
entity TemplatePhases {
    key ID          : UUID;
    template        : Association to Templates;
    name            : String(100);
    sequence        : Integer; // Added: To keep phases in the correct order
    tasks           : Composition of many TemplateTasks on tasks.phase = $self;
}
entity TemplateTasks {
    key ID          : UUID;
    phase           : Association to TemplatePhases;
    name            : String(100);
    role            : String(50);
    defaultHours    : Integer;
    sequence        : Integer; // Added: To keep tasks in the correct order
}
entity WBSTasks {
    key ID          : UUID;
    project         : Association to Projects;
    phaseName       : String(100);
    name            : String(100);
    role            : String(50);
    resource        : Association to Resources;
    hours           : Integer;
    startDate       : Date;
    endDate         : Date;
    status          : String(20) default 'Not Started';
    sequence        : Integer;
    predecessor     : Association to WBSTasks;
    reallocatedTo   : Association to Resources;
}

// 5. [Legacy] Timesheets — kept temporarily to prevent DB deployment table drop errors
entity Timesheets {
    key ID          : UUID;
    employee        : Association to Resources;
    wbs             : Association to WBSTasks;
    date            : Date;
    hours           : Decimal(5,2);
    notes           : String(500);
    status          : String(20) default 'Draft';
}

// 5. WorkLogs — daily work log entries (created from Employee tab)
entity WorkLogs {
    key ID              : UUID;
    employee            : Association to Resources;
    wbs                 : Association to WBSTasks;
    ticket              : Association to Tickets;  // optional — set for ticket-based logs
    date                : Date;
    hours               : Decimal(5,2);
    isBillable          : Boolean default true;
    nonBillableType     : String(50);  // Training Given, Training Taken, Internal Meeting, Administrative Work
    description         : String(500);    
}

// 6. E-Diary View — read-only reporting (joins WorkLogs + WBS + Projects + Resources)
@cds.persistence.exists: false
entity EDiaryView as select from WorkLogs {
    key WorkLogs.ID              as ID,
    WorkLogs.date                as date,
    WorkLogs.hours               as hours,
    WorkLogs.isBillable          as isBillable,
    WorkLogs.nonBillableType     as nonBillableType,
    WorkLogs.description         as description,
    WorkLogs.employee.ID         as employeeId,
    WorkLogs.employee.name       as employeeName,
    WorkLogs.wbs.ID              as wbsId,
    WorkLogs.wbs.name            as taskName,
    WorkLogs.wbs.phaseName       as phaseName,
    WorkLogs.wbs.project.ID      as projectId,
    WorkLogs.wbs.project.name    as projectName,
    WorkLogs.ticket.ticketNo     as ticketNo
};

// 7. Tickets Allocation
entity Tickets {
    key ID              : UUID;
    project             : Association to Projects;
    date                : Date;
    module              : String(50);
    role                : Association to ResourceRoles;
    ticketNo            : String(50);
    description         : String(500);
    priority            : String(20) default 'Medium';  // Low | Medium | High
    hours               : Integer;                      // Planned hours
    status              : String(20) default 'Not Started'; // Not Started | Working | Paused | Completed
    resource            : Association to Resources;
    onBehalfOf          : Association to Resources;
}
