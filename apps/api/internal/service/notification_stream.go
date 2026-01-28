package service

import (
	"sync"

	"github.com/google/uuid"
)

// NotificationStreamEvent represents a single SSE payload.
type NotificationStreamEvent struct {
	Event string
	Data  []byte
}

// NotificationStreamClient represents a subscribed client.
type NotificationStreamClient struct {
	Events chan NotificationStreamEvent
}

// NotificationStreamHub manages SSE subscribers per user.
type NotificationStreamHub struct {
	mu      sync.RWMutex
	clients map[uuid.UUID]map[*NotificationStreamClient]struct{}
}

// NewNotificationStreamHub creates a new NotificationStreamHub.
func NewNotificationStreamHub() *NotificationStreamHub {
	return &NotificationStreamHub{
		clients: make(map[uuid.UUID]map[*NotificationStreamClient]struct{}),
	}
}

// Subscribe registers a client for a user.
func (h *NotificationStreamHub) Subscribe(userID uuid.UUID) *NotificationStreamClient {
	client := &NotificationStreamClient{
		Events: make(chan NotificationStreamEvent, 16),
	}

	h.mu.Lock()
	defer h.mu.Unlock()
	if h.clients[userID] == nil {
		h.clients[userID] = make(map[*NotificationStreamClient]struct{})
	}
	h.clients[userID][client] = struct{}{}
	return client
}

// Unsubscribe removes a client from the hub.
func (h *NotificationStreamHub) Unsubscribe(userID uuid.UUID, client *NotificationStreamClient) {
	h.mu.Lock()
	defer h.mu.Unlock()

	clients, ok := h.clients[userID]
	if !ok {
		return
	}

	if _, exists := clients[client]; exists {
		delete(clients, client)
		close(client.Events)
	}

	if len(clients) == 0 {
		delete(h.clients, userID)
	}
}

// Publish sends an event to all clients for a user.
func (h *NotificationStreamHub) Publish(userID uuid.UUID, event NotificationStreamEvent) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	clients := h.clients[userID]
	for client := range clients {
		select {
		case client.Events <- event:
		default:
			// Drop events if the client is slow.
		}
	}
}
