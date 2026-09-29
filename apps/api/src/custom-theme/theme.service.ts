import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as deepmerge from 'deepmerge';
import { Theme, ThemeScope } from '../entities/theme.entity';
import {
  CreateThemeDto,
  ThemeCssVariablesResponseDto,
  ThemeOverrideDto,
  ThemePreviewResponseDto,
  ThemeQueryDto,
  ThemeResponseDto,
  UpdateThemeDto,
} from '../dto/theme.dto';
import { ThemeRepository } from '../repositories/theme.repository';
import { DEFAULT_THEME_CONFIG, ThemeConfig } from '../types/theme-config.types';
import {
  generateCssVariables,
  generateDarkModeVariables,
  generateFullCssBundle,
} from '../utils/css-generator.util';

@Injectable()
export class ThemeService {
  private readonly logger = new Logger(ThemeService.name);

  constructor(
    @InjectRepository(ThemeRepository)
    private readonly themeRepository: ThemeRepository,
  ) {}

  // ─── CRUD ────────────────────────────────────────────────────────────────

  async create(dto: CreateThemeDto, actorId?: string): Promise<ThemeResponseDto> {
    const scope = dto.scope ?? ThemeScope.GLOBAL;

    // Validate owner required for non-global scopes
    if (scope !== ThemeScope.GLOBAL && !dto.scopeOwnerId) {
      throw new BadRequestException(
        `scopeOwnerId is required for scope "${scope}"`,
      );
    }

    // Resolve parent config if inheritance is requested
    let resolvedConfig = DEFAULT_THEME_CONFIG;
    if (dto.parentThemeId) {
      const parent = await this.themeRepository.findActiveById(dto.parentThemeId);
      if (!parent) {
        throw new NotFoundException(`Parent theme "${dto.parentThemeId}" not found`);
      }
      resolvedConfig = parent.config;
    }

    // Deep-merge supplied config overrides onto the resolved base
    const finalConfig: ThemeConfig = dto.config
      ? deepmerge(resolvedConfig, dto.config as Partial<ThemeConfig>, {
          arrayMerge: (_, src) => src,
        })
      : resolvedConfig;

    // If this theme is being set as default, clear existing defaults first
    if (dto.isDefault) {
      await this.themeRepository.unsetDefaultForScope(scope, dto.scopeOwnerId);
    }

    const theme = this.themeRepository.create({
      name: dto.name,
      description: dto.description ?? null,
      scope,
      scopeOwnerId: dto.scopeOwnerId ?? null,
      parentThemeId: dto.parentThemeId ?? null,
      config: finalConfig,
      isDefault: dto.isDefault ?? false,
      isActive: true,
      isReadOnly: false,
      createdBy: actorId ?? null,
      updatedBy: actorId ?? null,
    });

    try {
      const saved = await this.themeRepository.save(theme);
      this.logger.log(`Theme created: ${saved.id} (${saved.name})`);
      return this.toResponseDto(saved);
    } catch (err: any) {
      if (err?.code === '23505') {
        throw new ConflictException(
          `A theme named "${dto.name}" already exists for scope "${scope}"`,
        );
      }
      throw err;
    }
  }

  async findAll(query: ThemeQueryDto): Promise<ThemeResponseDto[]> {
    const themes = await this.themeRepository.findByScope(
      query.scope ?? ThemeScope.GLOBAL,
      query.scopeOwnerId,
    );

    return themes
      .filter((t) => {
        if (query.isActive !== undefined && t.isActive !== query.isActive) return false;
        if (query.isDefault !== undefined && t.isDefault !== query.isDefault) return false;
        return true;
      })
      .map((theme) => this.toResponseDto(theme));
  }

  async findOne(id: string): Promise<ThemeResponseDto> {
    const theme = await this.themeRepository.findActiveById(id);
    if (!theme) throw new NotFoundException(`Theme "${id}" not found`);
    return this.toResponseDto(theme);
  }

  async update(id: string, dto: UpdateThemeDto, actorId?: string): Promise<ThemeResponseDto> {
    const theme = await this.themeRepository.findActiveById(id);
    if (!theme) throw new NotFoundException(`Theme "${id}" not found`);

    if (theme.isReadOnly) {
      throw new BadRequestException(`Theme "${id}" is read-only and cannot be modified`);
    }

    if (dto.isDefault && !theme.isDefault) {
      await this.themeRepository.unsetDefaultForScope(
        theme.scope,
        theme.scopeOwnerId ?? undefined,
      );
    }

    if (dto.config) {
      theme.config = deepmerge(theme.config, dto.config as Partial<ThemeConfig>, {
        arrayMerge: (_, src) => src,
      });
    }

    if (dto.name !== undefined) theme.name = dto.name;
    if (dto.description !== undefined) theme.description = dto.description ?? null;
    if (dto.isDefault !== undefined) theme.isDefault = dto.isDefault;
    theme.updatedBy = actorId ?? null;

    const saved = await this.themeRepository.save(theme);
    this.logger.log(`Theme updated: ${saved.id}`);
    return this.toResponseDto(saved);
  }

  async remove(id: string, actorId?: string): Promise<void> {
    const theme = await this.themeRepository.findActiveById(id);
    if (!theme) throw new NotFoundException(`Theme "${id}" not found`);

    if (theme.isReadOnly) {
      throw new BadRequestException(`Theme "${id}" is read-only and cannot be deleted`);
    }

    if (theme.isDefault) {
      throw new BadRequestException(
        'Cannot delete the default theme. Set another theme as default first.',
      );
    }

    await this.themeRepository.softDelete(id, actorId);
    this.logger.log(`Theme soft-deleted: ${id}`);
  }

  // ─── Override / Merge ─────────────────────────────────────────────────────

  async applyOverride(
    id: string,
    dto: ThemeOverrideDto,
    actorId?: string,
  ): Promise<ThemeResponseDto> {
    const theme = await this.themeRepository.findActiveById(id);
    if (!theme) throw new NotFoundException(`Theme "${id}" not found`);

    if (theme.isReadOnly) {
      throw new BadRequestException(`Theme "${id}" is read-only`);
    }

    theme.config = deepmerge(
      theme.config,
      dto.overrides as Partial<ThemeConfig>,
      { arrayMerge: (_, src) => src },
    );
    theme.updatedBy = actorId ?? null;

    const saved = await this.themeRepository.save(theme);
    this.logger.log(`Theme override applied: ${id}`);
    return this.toResponseDto(saved);
  }

  async resetToDefault(id: string, actorId?: string): Promise<ThemeResponseDto> {
    const theme = await this.themeRepository.findActiveById(id);
    if (!theme) throw new NotFoundException(`Theme "${id}" not found`);

    if (theme.isReadOnly) {
      throw new BadRequestException(`Theme "${id}" is read-only`);
    }

    let baseConfig = DEFAULT_THEME_CONFIG;
    if (theme.parentThemeId) {
      const parent = await this.themeRepository.findActiveById(theme.parentThemeId);
      if (parent) baseConfig = parent.config;
    }

    theme.config = baseConfig;
    theme.updatedBy = actorId ?? null;
    const saved = await this.themeRepository.save(theme);
    return this.toResponseDto(saved);
  }

  // ─── CSS Generation ───────────────────────────────────────────────────────

  async getCssVariables(id: string): Promise<ThemeCssVariablesResponseDto> {
    const theme = await this.themeRepository.findActiveById(id);
    if (!theme) throw new NotFoundException(`Theme "${id}" not found`);

    const variables = generateCssVariables(theme.config);
    const darkVariables = generateDarkModeVariables(theme.config);
    const cssVariables = generateFullCssBundle(theme.config);

    return { cssVariables, variables, darkVariables };
  }

  async getPreview(id: string): Promise<ThemePreviewResponseDto> {
    const themeDto = await this.findOne(id);
    const theme = await this.themeRepository.findActiveById(id);

    const variables = generateCssVariables(theme!.config);
    const darkVariables = generateDarkModeVariables(theme!.config);
    const cssVariables = generateFullCssBundle(theme!.config);

    return {
      theme: themeDto,
      css: { cssVariables, variables, darkVariables },
    };
  }

  async getDefaultTheme(scope: ThemeScope, scopeOwnerId?: string): Promise<ThemeResponseDto> {
    const theme = await this.themeRepository.findDefaultForScope(scope, scopeOwnerId);

    // Fallback: return any active theme for the scope
    if (!theme) {
      const [fallback] = await this.themeRepository.findByScope(scope, scopeOwnerId);
      if (!fallback) {
        // Last resort: synthesise a virtual default
        return {
          id: 'default',
          name: 'Default Theme',
          description: 'System default theme',
          scope,
          scopeOwnerId: scopeOwnerId ?? null,
          config: DEFAULT_THEME_CONFIG,
          isDefault: true,
          isActive: true,
          isReadOnly: true,
          parentThemeId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      }
      return this.toResponseDto(fallback);
    }

    return this.toResponseDto(theme);
  }

  // ─── Clone ────────────────────────────────────────────────────────────────

  async clone(
    id: string,
    newName: string,
    actorId?: string,
  ): Promise<ThemeResponseDto> {
    const source = await this.themeRepository.findActiveById(id);
    if (!source) throw new NotFoundException(`Theme "${id}" not found`);

    return this.create(
      {
        name: newName,
        description: `Cloned from: ${source.name}`,
        scope: source.scope,
        scopeOwnerId: source.scopeOwnerId ?? undefined,
        config: source.config as any,
        isDefault: false,
      },
      actorId,
    );
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private toResponseDto(theme: Theme): ThemeResponseDto {
    return {
      id: theme.id,
      name: theme.name,
      description: theme.description,
      scope: theme.scope,
      scopeOwnerId: theme.scopeOwnerId,
      config: theme.config,
      isDefault: theme.isDefault,
      isActive: theme.isActive,
      isReadOnly: theme.isReadOnly,
      parentThemeId: theme.parentThemeId,
      createdAt: theme.createdAt,
      updatedAt: theme.updatedAt,
    };
  }
}
