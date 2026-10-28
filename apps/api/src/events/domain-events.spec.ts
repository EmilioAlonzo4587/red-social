import { Injectable, Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type {
  CommentChangedEvent,
  FollowCreatedEvent,
  LikeChangedEvent,
} from './domain-events';
import { DomainEvents } from './domain-events.service';
import { EventsModule } from './events.module';
import { OnDomainEvent } from './on-domain-event.decorator';

const like: LikeChangedEvent = {
  postId: 'p1',
  postAuthorId: 'u1',
  actorId: 'u2',
  change: 'added',
  likeCount: 1,
};

// Un listener como el que escribirán el Gateway y las notificaciones
@Injectable()
class TestListener {
  likes: LikeChangedEvent[] = [];
  follows: FollowCreatedEvent[] = [];

  @OnDomainEvent('like.changed')
  onLike(event: LikeChangedEvent): void {
    this.likes.push(event);
  }

  @OnDomainEvent('follow.created')
  onFollow(event: FollowCreatedEvent): void {
    this.follows.push(event);
  }

  @OnDomainEvent('comment.changed')
  onComment(): Promise<void> {
    return Promise.reject(new Error('el listener falló'));
  }
}

// Comprobación de tipos: si deja de dar error, typecheck falla por el @ts-expect-error que sobra
class WrongListener {
  // @ts-expect-error: like.changed no entrega FollowCreatedEvent
  @OnDomainEvent('like.changed')
  onLike(event: FollowCreatedEvent): void {
    void event;
  }
}
void WrongListener;

describe('DomainEvents', () => {
  let moduleRef: TestingModule;
  let events: DomainEvents;
  let listener: TestListener;

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [EventsModule],
      providers: [TestListener],
    }).compile();
    // init registra los @OnDomainEvent (onApplicationBootstrap)
    await moduleRef.init();
    events = moduleRef.get(DomainEvents);
    listener = moduleRef.get(TestListener);
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  it('entrega los datos solo al listener de ese evento', () => {
    events.emit('like.changed', like);

    expect(listener.likes).toEqual([like]);
    expect(listener.follows).toEqual([]);
  });

  it('un listener que falla no le lanza el error a quien emite', async () => {
    const logged = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const comment: CommentChangedEvent = {
      postId: 'p1',
      postAuthorId: 'u1',
      actorId: 'u2',
      commentId: 'c1',
      change: 'added',
      commentCount: 1,
    };

    expect(() => events.emit('comment.changed', comment)).not.toThrow();
    // El error se registra en el log después de que la promesa del listener se rechaza
    await new Promise((resolve) => setImmediate(resolve));
    expect(logged).toHaveBeenCalledWith(
      'el listener falló',
      expect.any(String),
    );
    logged.mockRestore();
  });

  it('el nombre del evento decide qué datos acepta', () => {
    // Solo se compila, no se ejecuta: lo verifica typecheck
    const typeChecks = () => {
      // @ts-expect-error: follow.created no acepta los datos de un like
      events.emit('follow.created', like);
      // @ts-expect-error: un evento que no está en DomainEventMap
      events.emit('post.created', like);
    };
    expect(typeChecks).toBeInstanceOf(Function);
  });
});
