// src/services/socket.service.js
/**
 * Socket.IO Service for Real-time Updates
 * Manages WebSocket connections and emits real-time events
 */

class SocketService {
  constructor() {
    this.io = null;
  }

  /**
   * Initialize Socket.IO instance
   * @param {Server} io - Socket.IO server instance
   */
  initialize(io) {
    this.io = io;
  }

  /**
   * Emit new lead created event to specific company
   * @param {String} companyId - Company ID
   * @param {Object} lead - Lead data
   */
  emitNewLead(companyId, lead) {
    if (!this.io) return;

    const room = `company_${companyId}`;
    this.io.to(room).emit("lead:new", {
      type: "lead:new",
      data: lead,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Emit lead updated event
   * @param {String} companyId - Company ID
   * @param {Object} lead - Updated lead data
   */
  emitLeadUpdated(companyId, lead) {
    if (!this.io) return;

    const room = `company_${companyId}`;
    this.io.to(room).emit("lead:updated", {
      type: "lead:updated",
      data: lead,
      timestamp: new Date().toISOString(),
    });

    console.log(`📡 Emitted lead updated event to room: ${room}`);
  }

  /**
   * Emit lead deleted event
   * @param {String} companyId - Company ID
   * @param {String} leadId - Deleted lead ID
   */
  emitLeadDeleted(companyId, leadId) {
    if (!this.io) return;

    const room = `company_${companyId}`;
    this.io.to(room).emit("lead:deleted", {
      type: "lead:deleted",
      data: { leadId },
      timestamp: new Date().toISOString(),
    });

    console.log(`📡 Emitted lead deleted event to room: ${room}`);
  }

  /**
   * Emit CRM sync completed event
   * @param {String} companyId - Company ID
   * @param {Object} stats - Sync statistics
   */
  emitCrmSyncCompleted(companyId, stats) {
    if (!this.io) return;

    const room = `company_${companyId}`;
    this.io.to(room).emit("crm:sync:completed", {
      type: "crm:sync:completed",
      data: stats,
      timestamp: new Date().toISOString(),
    });

    console.log(`📡 Emitted CRM sync completed to room: ${room}`, stats);
  }
}

const socketService = new SocketService();
export default socketService;