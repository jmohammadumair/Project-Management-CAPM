sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/ui/core/format/DateFormat",
    "sap/ui/core/format/NumberFormat"
], function (Controller, JSONModel, MessageToast, DateFormat, NumberFormat) {
    "use strict";

    return Controller.extend("projectmanagement.controller.View1", {
        onInit: function () {
            const oData = {
                activeTab: "projects",
                availableRoles: [],
                
                projects: [],
                resources: [],
                allocations: [],
                
                editingProjectId: null,
                editingResourceId: null,
                newCustomRole: "",
                newProject: { requiredRoles: [] },
                newResource: { roles: [] },
                newAllocation: { projectId: "" },
                newAllocationSlots: [],
                selectedProjectCapacity: 0,
                
                filters: { projectId: "", resourceId: "" },

                analytics: { 
                    enrichedProjects: [], enrichedResources: [], projectionsByProject: [], projectionsByResource: [], summary: {}
                }
            };

            const oModel = new JSONModel(oData);
            this.getView().setModel(oModel);

            this._loadBackendData()
                .then(function () {
                    this._calculateAnalytics();
                }.bind(this))
                .catch(function () {
                    MessageToast.show("Failed to load data from CAP service");
                });
        },

        getWorkingHours: function(startStr, endStr) {
            if (!startStr || !endStr) return 0;
            const s = new Date(startStr);
            const e = new Date(endStr);
            if (isNaN(s.getTime()) || isNaN(e.getTime()) || e < s) return 0;
            let count = 0;
            const cur = new Date(s);
            while (cur <= e) {
                const day = cur.getDay();
                if (day !== 0 && day !== 6) count++;
                cur.setDate(cur.getDate() + 1);
            }
            return count * 8;
        },

        _calculateAnalytics: function() {
            const oModel = this.getView().getModel();
            const data = oModel.getData();
            const MAX_HOURS = 2080;

            const enrichedProjects = data.projects.map(p => {
                let actualCost = 0;
                const standardCapacity = this.getWorkingHours(p.startDate, p.endDate);
                const assignedResources = data.allocations
                    .filter(a => a.projectId === p.id)
                    .map(a => {
                        const res = data.resources.find(r => r.id === a.resourceId);
                        if (res) actualCost += a.hours * res.hourlyRate;
                        const weekendHrs = Math.max(0, a.hours - standardCapacity);
                        return { name: res?.name || 'Unknown', role: a.role || 'Unassigned', hours: a.hours, weekendHrs: weekendHrs };
                    });
                return { ...p, assignedResources, actualCost, standardCapacity };
            });

            const enrichedResources = data.resources.map(r => {
                const assignedProjects = new Set();
                data.allocations.filter(a => a.resourceId === r.id).forEach(a => {
                    const p = data.projects.find(proj => proj.id === a.projectId);
                    if (p) assignedProjects.add(p.name);
                });
                return { ...r, assignedProjects: Array.from(assignedProjects).join(', ') || 'None' };
            });

            let projectionsByProject = data.projects.map(p => {
                let allocatedCost = 0;
                const activeResources = new Set();
                data.allocations.filter(a => a.projectId === p.id).forEach(alloc => {
                    const res = data.resources.find(r => r.id === alloc.resourceId);
                    if (res) {
                        allocatedCost += alloc.hours * res.hourlyRate;
                        activeResources.add(res.name);
                    }
                });
                const remaining = p.budget - allocatedCost;
                let statusState = "Success";
                if (remaining < 0) statusState = "Error"; else if (remaining < 10000) statusState = "Warning";
                return { ...p, allocatedCost, remaining, resourceCount: activeResources.size, statusState };
            });

            let projectionsByResource = data.resources.map(r => {
                let totalHours = 0, totalStandardHours = 0, totalWeekendHours = 0;
                const projectNames = new Set();
                const allocationsBreakdown = [];
                let colorIndex = 0;

                data.allocations.filter(a => a.resourceId === r.id).forEach(alloc => {
                    totalHours += alloc.hours;
                    const proj = data.projects.find(p => p.id === alloc.projectId);
                    if (proj) projectNames.add(proj.name);
                    
                    const projCapacity = proj ? this.getWorkingHours(proj.startDate, proj.endDate) : 0;
                    totalStandardHours += Math.min(alloc.hours, projCapacity);
                    totalWeekendHours += Math.max(0, alloc.hours - projCapacity);

                    allocationsBreakdown.push({
                    projectName: proj ? proj.name : 'Unknown', 
                    hours: alloc.hours,
                    percentage: ((alloc.hours / MAX_HOURS) * 100) + "%", 
                    colorKey: String(colorIndex++ % 4) // <--- CHANGED THIS LINE
                });
                });

                allocationsBreakdown.forEach(ab => {
                    if (totalHours > MAX_HOURS) ab.percentage = ((ab.hours / totalHours) * 100) + "%";
                });

                return {
                    ...r, totalHours, totalStandardHours, totalWeekendHours,
                    totalBilled: totalHours * r.hourlyRate,
                    projectsAssigned: Array.from(projectNames).join(', ') || 'None',
                    statusText: totalHours > MAX_HOURS ? "Over Occupied" : "Within Capacity",
                    statusState: totalHours > MAX_HOURS ? "Error" : "Success",
                    utilizationPercent: (totalHours / MAX_HOURS) * 100,
                    utilizationDisplay: `${Math.round((totalHours / MAX_HOURS) * 100)}%`,
                    allocationsBreakdown
                };
            });

            const totalBudget = data.projects.reduce((sum, p) => sum + p.budget, 0);
            const totalCost = projectionsByProject.reduce((sum, p) => sum + p.allocatedCost, 0);
            const totalCapacity = data.resources.length * 2080;
            const totalAllocatedHours = data.allocations.reduce((sum, a) => sum + a.hours, 0);

            const summary = {
                totalBudget, totalCost, 
                budgetConsumption: totalBudget ? (totalCost / totalBudget) * 100 : 0,
                totalCapacity, totalAllocatedHours, 
                hoursUtilization: totalCapacity ? (totalAllocatedHours / totalCapacity) * 100 : 0
            };

            if (data.filters.projectId) {
                projectionsByProject = projectionsByProject.filter(p => p.id === data.filters.projectId);
                projectionsByResource = projectionsByResource.filter(r => data.allocations.some(a => a.resourceId === r.id && a.projectId === data.filters.projectId));
            }
            if (data.filters.resourceId) {
                projectionsByProject = projectionsByProject.filter(p => data.allocations.some(a => a.projectId === p.id && a.resourceId === data.filters.resourceId));
                projectionsByResource = projectionsByResource.filter(r => r.id === data.filters.resourceId);
            }

            oModel.setProperty("/analytics/enrichedProjects", enrichedProjects);
            oModel.setProperty("/analytics/enrichedResources", enrichedResources);
            oModel.setProperty("/analytics/projectionsByProject", projectionsByProject);
            oModel.setProperty("/analytics/projectionsByResource", projectionsByResource);
            oModel.setProperty("/analytics/summary", summary);
        },

        onFilterChange: function() { this._calculateAnalytics(); },
        onClearFilters: function() {
            this.getView().getModel().setProperty("/filters", { projectId: "", resourceId: "" });
            this._calculateAnalytics();
        },

        _openDialog: function(sFragmentName) {
            const oView = this.getView();
            const sPath = "projectmanagement.view.fragments." + sFragmentName;
            
            if (!this["_p" + sFragmentName]) {
                this["_p" + sFragmentName] = this.loadFragment({ name: sPath }).then(function(oDialog) {
                    oView.addDependent(oDialog);
                    return oDialog;
                });
            }
            this["_p" + sFragmentName].then(function(oDialog) { oDialog.open(); });
        },

        onCloseDialog: function(oEvent) { oEvent.getSource().getParent().close(); },

        onAddProject: function() {
            const oModel = this.getView().getModel();
            const count = oModel.getProperty("/projects").length;
            oModel.setProperty("/editingProjectId", null);
            oModel.setProperty("/newProject", { id: `P00${count + 1}`, name: "", budget: null, startDate: "", endDate: "", requiredRoles: [] });
            this._openDialog("CreateProject");
        },

        onEditProject: function(oEvent) {
            const oItem = oEvent.getSource().getBindingContext().getObject();
            const oModel = this.getView().getModel();
            const itemCopy = JSON.parse(JSON.stringify(oItem));
            oModel.setProperty("/editingProjectId", itemCopy.id);
            oModel.setProperty("/newProject", itemCopy);
            this._openDialog("CreateProject");
        },

        onAddRoleToProject: function() {
            const roles = this.getView().getModel().getProperty("/newProject/requiredRoles") || [];
            roles.push({ role: "", count: 1 });
            this.getView().getModel().setProperty("/newProject/requiredRoles", roles);
        },

        onDeleteRoleFromProject: function(oEvent) {
            const path = oEvent.getSource().getBindingContext().getPath();
            const idx = parseInt(path.split("/").pop());
            const roles = this.getView().getModel().getProperty("/newProject/requiredRoles");
            roles.splice(idx, 1);
            this.getView().getModel().setProperty("/newProject/requiredRoles", roles);
        },

        onAddCustomRole: function() {
            const oModel = this.getView().getModel();
            const newRole = (oModel.getProperty("/newCustomRole") || "").trim();
            const availableRoles = oModel.getProperty("/availableRoles") || [];
            if (newRole && !availableRoles.includes(newRole)) {
                availableRoles.push(newRole);
                oModel.setProperty("/availableRoles", availableRoles);
            }
            oModel.setProperty("/newCustomRole", "");
        },

        onSaveProject: function () {
            const oViewModel = this.getView().getModel();
            const newProj = oViewModel.getProperty("/newProject");
            const editId = oViewModel.getProperty("/editingProjectId");

            if (!newProj.name || !newProj.startDate || !newProj.endDate) {
                MessageToast.show("Please fill required fields");
                return;
            }

            const oODataModel = this.getOwnerComponent().getModel();
            const oListBinding = oODataModel.bindList("/Projects");

            if (editId) {
                MessageToast.show("Editing requires fetching the specific context first.");
            } else {
                const oContext = oListBinding.create({
                    ID: newProj.id,
                    name: newProj.name,
                    budget: parseFloat(newProj.budget) || 0,
                    startDate: newProj.startDate,
                    endDate: newProj.endDate
                });

                oContext.created().then(function () {
                    MessageToast.show("Project saved to database successfully!");
                    this.byId("CreateProjectDialog").close();
                    this._loadBackendData().then(function () {
                        this._calculateAnalytics();
                    }.bind(this));
                }.bind(this)).catch(function (oError) {
                    MessageToast.show("Failed to save project to the database.");
                    // eslint-disable-next-line no-console
                    console.error(oError);
                });
            }
        },

        onDeleteProject: function(oEvent) {
            // Traverse up to find the ColumnListItem (handles clicks from icons)
            let oItem = oEvent.getSource();
            while (oItem && !oItem.getBindingContext) {
                oItem = oItem.getParent();
            }
            
            if (oItem && oItem.getBindingContext()) {
                const oObj = oItem.getBindingContext().getObject();
                const oModel = this.getView().getModel();
                
                oModel.setProperty("/projects", oModel.getProperty("/projects").filter(p => p.id !== oObj.id));
                oModel.setProperty("/allocations", oModel.getProperty("/allocations").filter(a => a.projectId !== oObj.id));
                this._calculateAnalytics();
                MessageToast.show("Project Deleted");
            }
        },

        onAddResource: function() {
            const oModel = this.getView().getModel();
            const count = oModel.getProperty("/resources").length;
            oModel.setProperty("/editingResourceId", null);
            oModel.setProperty("/newResource", { id: `R00${count + 1}`, name: "", type: "Full Time", roles: [], salary: null, officeCost: null, overheadCost: null, hourlyRate: 0 });
            this._openDialog("CreateResource");
        },

        onEditResource: function(oEvent) {
            const oItem = oEvent.getSource().getBindingContext().getObject();
            const oModel = this.getView().getModel();
            const itemCopy = JSON.parse(JSON.stringify(oItem));
            oModel.setProperty("/editingResourceId", itemCopy.id);
            oModel.setProperty("/newResource", itemCopy);
            this._openDialog("CreateResource");
        },

        onResTypeChange: function() {
            const oModel = this.getView().getModel();
            if (oModel.getProperty("/newResource/type") === "Contract") {
                oModel.setProperty("/newResource/officeCost", 0);
                oModel.setProperty("/newResource/overheadCost", 0);
            }
            this.onCalcHourlyRate();
        },

        onCalcHourlyRate: function() {
            const oModel = this.getView().getModel();
            const res = oModel.getProperty("/newResource");
            const total = (parseFloat(res.salary) || 0) + (parseFloat(res.officeCost) || 0) + (parseFloat(res.overheadCost) || 0);
            oModel.setProperty("/newResource/hourlyRate", total > 0 ? Math.round(total / 2080) : 0);
        },

        isRoleSelected: function(sRole, aSelectedRoles) {
            if (!aSelectedRoles) return false;
            return aSelectedRoles.indexOf(sRole) !== -1;
        },

        onRoleSelectionChange: function(oEvent) {
            const bSelected = oEvent.getParameter("selected");
            const sRole = oEvent.getSource().getBindingContext().getObject();
            const oModel = this.getView().getModel();
            let aRoles = oModel.getProperty("/newResource/roles") || [];

            if (bSelected && aRoles.indexOf(sRole) === -1) {
                aRoles.push(sRole);
            } else if (!bSelected && aRoles.indexOf(sRole) !== -1) {
                aRoles = aRoles.filter(r => r !== sRole);
            }
            oModel.setProperty("/newResource/roles", aRoles);
        },

        onSaveResource: function() {
            const oModel = this.getView().getModel();
            const newRes = oModel.getProperty("/newResource");
            const editId = oModel.getProperty("/editingResourceId");

            if (!newRes.name || newRes.roles.length === 0 || !newRes.salary) {
                MessageToast.show("Please fill required fields"); return;
            }

            const resources = oModel.getProperty("/resources");

            if (editId) {
                const index = resources.findIndex(r => r.id === editId);
                if (index !== -1) resources[index] = JSON.parse(JSON.stringify(newRes));
            } else {
                resources.push(JSON.parse(JSON.stringify(newRes)));
            }

            oModel.setProperty("/resources", resources);
            this._calculateAnalytics();
            this.byId("CreateResourceDialog").close();
            MessageToast.show(editId ? "Resource Updated" : "Resource Saved");
        },

        onDeleteResource: function(oEvent) {
            // Traverse up to find the ColumnListItem
            let oItem = oEvent.getSource();
            while (oItem && !oItem.getBindingContext) {
                oItem = oItem.getParent();
            }
            
            if (oItem && oItem.getBindingContext()) {
                const oObj = oItem.getBindingContext().getObject();
                const oModel = this.getView().getModel();
                
                oModel.setProperty("/resources", oModel.getProperty("/resources").filter(r => r.id !== oObj.id));
                oModel.setProperty("/allocations", oModel.getProperty("/allocations").filter(a => a.resourceId !== oObj.id));
                this._calculateAnalytics();
                MessageToast.show("Resource Deleted");
            }
        },

        onAddAllocation: function() {
            this.getView().getModel().setProperty("/newAllocation", { projectId: "" });
            this.getView().getModel().setProperty("/newAllocationSlots", []);
            this.getView().getModel().setProperty("/selectedProjectCapacity", 0);
            this._openDialog("CreateAllocation");
        },

        onAllocProjectChange: function(oEvent) {
            const projectId = oEvent.getParameter("selectedItem").getKey();
            const oModel = this.getView().getModel();
            const proj = oModel.getProperty("/projects").find(p => p.id === projectId);
            const existingAllocs = oModel.getProperty("/allocations").filter(a => a.projectId === projectId);
            
            oModel.setProperty("/selectedProjectCapacity", this.getWorkingHours(proj.startDate, proj.endDate));
            oModel.setProperty("/selectedProjectStartDate", proj.startDate);
            oModel.setProperty("/selectedProjectEndDate", proj.endDate);

            const slots = [];
            const fulfilledRoles = {};

            existingAllocs.forEach((alloc, idx) => {
                const isCustom = !proj.requiredRoles.some(req => req.role === alloc.role);
                slots.push({ id: `slot_ext_${idx}`, role: alloc.role || '', resourceId: alloc.resourceId, hours: alloc.hours, customRole: isCustom });
                if (alloc.role && !isCustom) fulfilledRoles[alloc.role] = (fulfilledRoles[alloc.role] || 0) + 1;
            });

            if (proj.requiredRoles) {
                proj.requiredRoles.forEach((req, idx) => {
                    const remaining = req.count - (fulfilledRoles[req.role] || 0);
                    for (let i = 0; i < remaining; i++) {
                        slots.push({ id: `slot_req_${idx}_${i}`, role: req.role, resourceId: "", hours: null, customRole: false });
                    }
                });
            }

            if (slots.length === 0) slots.push({ id: "slot_custom_0", role: "", resourceId: "", hours: null, customRole: true });
            oModel.setProperty("/newAllocationSlots", slots);
        },

        onAddAllocSlot: function() {
            const slots = this.getView().getModel().getProperty("/newAllocationSlots");
            slots.push({ id: `slot_custom_${Date.now()}`, role: "", resourceId: "", hours: null, customRole: true });
            this.getView().getModel().setProperty("/newAllocationSlots", slots);
        },

        onRemoveAllocSlot: function(oEvent) {
            const path = oEvent.getSource().getBindingContext().getPath();
            const idx = parseInt(path.split("/").pop());
            const slots = this.getView().getModel().getProperty("/newAllocationSlots");
            slots.splice(idx, 1);
            this.getView().getModel().setProperty("/newAllocationSlots", slots);
        },

        onSaveAllocation: function() {
            const oModel = this.getView().getModel();
            const projectId = oModel.getProperty("/newAllocation/projectId");
            const slots = oModel.getProperty("/newAllocationSlots");
            
            const validSlots = slots.filter(s => s.resourceId && s.hours > 0);
            
            let allocations = oModel.getProperty("/allocations").filter(a => a.projectId !== projectId);
            validSlots.forEach(s => allocations.push({ projectId, resourceId: s.resourceId, role: s.role, hours: parseInt(s.hours) }));
            
            oModel.setProperty("/allocations", allocations);
            this._calculateAnalytics();
            this.byId("CreateAllocationDialog").close();
            MessageToast.show("Allocations Updated");
        },

        formatCurrency: function (value) {
            if (value === null || value === undefined) return "";
            // Changed formatting to include .00 exactly like your images
            return parseFloat(value).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
        },

        formatPercentOneDecimal: function (value) {
            if (value === null || value === undefined || isNaN(value)) {
                return "";
            }
            const oFormatter = NumberFormat.getFloatInstance({
                maxFractionDigits: 1,
                minFractionDigits: 1
            });
            return oFormatter.format(value);
        },

        formatExtraCost: function (officeCost, overheadCost) {
            const total = (parseFloat(officeCost) || 0) + (parseFloat(overheadCost) || 0);
            if (!total) {
                return "";
            }
            const oFormatter = NumberFormat.getFloatInstance();
            return oFormatter.format(total);
        },
        
        formatDate: function(dateStr) {
            if (!dateStr) return "";
            const oDate = new Date(dateStr);
            return DateFormat.getDateInstance({style: "medium"}).format(oDate);
        },

        _readAll: function(oODataModel, sPath) {
            const oListBinding = oODataModel.bindList(sPath);
            return oListBinding.requestContexts().then(function(aContexts) {
                return aContexts.map(function(oCtx) {
                    return oCtx.getObject();
                });
            });
        },

        _loadBackendData: async function() {
            const oODataModel = this.getOwnerComponent().getModel(); // default OData V4 model from manifest (/browse/)
            const oViewModel = this.getView().getModel();

            const [
                aProjects,
                aResources,
                aAllocations,
                aProjectRoles,
                aResourceRoles
            ] = await Promise.all([
                this._readAll(oODataModel, "/Projects"),
                this._readAll(oODataModel, "/Resources"),
                this._readAll(oODataModel, "/Allocations"),
                this._readAll(oODataModel, "/ProjectRoles"),
                this._readAll(oODataModel, "/ResourceRoles")
            ]);

            const projects = aProjects.map(function(p) {
                const requiredRoles = aProjectRoles
                    .filter(function(pr) { return pr.project_ID === p.ID; })
                    .map(function(pr) {
                        return { role: pr.role, count: pr.count };
                    });

                return {
                    id: p.ID,
                    name: p.name,
                    budget: parseFloat(p.budget) || 0,
                    startDate: p.startDate,
                    endDate: p.endDate,
                    requiredRoles: requiredRoles
                };
            });

            const rolesByResourceId = aResourceRoles.reduce(function(acc, rr) {
                const rid = rr.resource_ID;
                if (!rid) return acc;
                if (!acc[rid]) acc[rid] = [];
                if (rr.role) acc[rid].push(rr.role);
                return acc;
            }, {});

            const resources = aResources.map(function(r) {
                const total = (parseFloat(r.salary) || 0) + (parseFloat(r.officeCost) || 0) + (parseFloat(r.overheadCost) || 0);
                const hourlyRate = parseFloat(r.hourlyRate);

                return {
                    id: r.ID,
                    name: r.name,
                    type: r.type,
                    roles: rolesByResourceId[r.ID] || [],
                    salary: parseFloat(r.salary) || 0,
                    officeCost: parseFloat(r.officeCost) || 0,
                    overheadCost: parseFloat(r.overheadCost) || 0,
                    hourlyRate: !isNaN(hourlyRate) && hourlyRate !== 0 ? hourlyRate : (total > 0 ? Math.round(total / 2080) : 0)
                };
            });

            const allocations = aAllocations.map(function(a) {
                return {
                    projectId: a.project_ID,
                    resourceId: a.resource_ID,
                    role: a.role,
                    hours: parseInt(a.hours, 10) || 0
                };
            });

            const roleSet = {};
            aProjectRoles.forEach(function(pr) {
                if (pr.role) roleSet[pr.role] = true;
            });
            aResourceRoles.forEach(function(rr) {
                if (rr.role) roleSet[rr.role] = true;
            });

            oViewModel.setProperty("/projects", projects);
            oViewModel.setProperty("/resources", resources);
            oViewModel.setProperty("/allocations", allocations);
            oViewModel.setProperty("/availableRoles", Object.keys(roleSet).sort());
        }
    });
});