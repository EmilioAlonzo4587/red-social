import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CloudinaryService } from '../media/cloudinary.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePostDto } from './dto/create-post.dto';
import { PostDto } from './dto/post.dto';
import { postSelect, toPostDto } from './post-select';

@Injectable()
export class PostsService {
  private readonly logger = new Logger(PostsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinary: CloudinaryService,
  ) {}

  // RN03: texto, imágenes o ambos, nunca vacía. Cada imagen debe estar en la carpeta
  // del autor (users/{id}/) para que nadie publique ni haga borrar una ajena (RN04).
  async create(authorId: string, dto: CreatePostDto): Promise<PostDto> {
    const content = dto.content ?? null;
    const media = dto.media ?? [];

    if (content === null && media.length === 0) {
      throw new BadRequestException({
        message: 'content: escribe un texto o agrega al menos una imagen',
        details: [{ field: 'content', rule: 'contentOrMedia' }],
      });
    }

    const foreign = media.findIndex(
      (m) => !this.cloudinary.belongsToUser(m.publicId, authorId),
    );
    if (foreign !== -1) {
      const field = `media.${foreign}.publicId`;
      throw new BadRequestException({
        message: `${field}: no pertenece al usuario`,
        details: [{ field, rule: 'ownership' }],
      });
    }

    // Un solo create anidado: la publicación y sus imágenes entran juntas o ninguna
    const post = await this.prisma.post.create({
      data: {
        authorId,
        content,
        media: {
          create: media.map((m, position) => ({
            publicId: m.publicId,
            mediaType: 'image',
            width: m.width,
            height: m.height,
            position,
          })),
        },
      },
      select: postSelect(authorId),
    });
    return toPostDto(post);
  }

  async findOne(id: string, viewerId: string): Promise<PostDto> {
    const post = await this.prisma.post.findFirst({
      where: { id, deletedAt: null },
      select: postSelect(viewerId),
    });
    if (!post) throw new NotFoundException('Publicación no encontrada');
    return toPostDto(post);
  }

  // RN04: solo el autor, con borrado lógico. Las imágenes se borran de Cloudinary después
  // de marcarla; si Cloudinary falla, la publicación ya no se ve y solo queda el aviso en el log.
  async remove(id: string, userId: string): Promise<void> {
    const post = await this.prisma.post.findFirst({
      where: { id, deletedAt: null },
      select: { authorId: true, media: { select: { publicId: true } } },
    });
    if (!post) throw new NotFoundException('Publicación no encontrada');
    if (post.authorId !== userId) {
      throw new ForbiddenException(
        'Solo el autor puede eliminar su publicación',
      );
    }

    await this.prisma.post.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await Promise.all(
      post.media.map(({ publicId }) =>
        this.cloudinary.deleteByPublicId(publicId).catch((error: unknown) => {
          this.logger.error(
            `No se pudo borrar la imagen ${publicId} de la publicación ${id}: ${String(error)}`,
          );
        }),
      ),
    );
  }
}
