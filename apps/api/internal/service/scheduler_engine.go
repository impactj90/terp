package service

import (
	"context"
	"sync"
	"time"

	"github.com/rs/zerolog/log"
)

// SchedulerEngine is a background worker that periodically checks and runs due schedules.
type SchedulerEngine struct {
	executor     *SchedulerExecutor
	tickInterval time.Duration
	mu           sync.Mutex
	running      bool
	cancel       context.CancelFunc
}

// NewSchedulerEngine creates a new SchedulerEngine.
// tickInterval controls how often the engine checks for due schedules.
func NewSchedulerEngine(executor *SchedulerExecutor, tickInterval time.Duration) *SchedulerEngine {
	if tickInterval <= 0 {
		tickInterval = 30 * time.Second
	}
	return &SchedulerEngine{
		executor:     executor,
		tickInterval: tickInterval,
	}
}

// Start begins the scheduler engine in a goroutine.
// Returns immediately. Call Stop() to shut down.
func (e *SchedulerEngine) Start() {
	e.mu.Lock()
	defer e.mu.Unlock()

	if e.running {
		return
	}

	ctx, cancel := context.WithCancel(context.Background())
	e.cancel = cancel
	e.running = true

	go e.run(ctx)
	log.Info().
		Dur("tick_interval", e.tickInterval).
		Msg("scheduler engine started")
}

// Stop gracefully shuts down the scheduler engine.
func (e *SchedulerEngine) Stop() {
	e.mu.Lock()
	defer e.mu.Unlock()

	if !e.running {
		return
	}

	e.cancel()
	e.running = false
	log.Info().Msg("scheduler engine stopped")
}

// IsRunning returns whether the engine is currently running.
func (e *SchedulerEngine) IsRunning() bool {
	e.mu.Lock()
	defer e.mu.Unlock()
	return e.running
}

func (e *SchedulerEngine) run(ctx context.Context) {
	ticker := time.NewTicker(e.tickInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			e.tick(ctx)
		}
	}
}

func (e *SchedulerEngine) tick(ctx context.Context) {
	defer func() {
		if r := recover(); r != nil {
			log.Error().Interface("panic", r).Msg("scheduler engine tick panicked")
		}
	}()

	if err := e.executor.RunDueSchedules(ctx); err != nil {
		if ctx.Err() != nil {
			return // context cancelled, shutting down
		}
		log.Error().Err(err).Msg("scheduler engine tick failed")
	}
}
