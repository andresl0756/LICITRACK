export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json }
  | Json[];

export type Database = {
  public: {
    Tables: {
      mi_seguimiento: {
        Row: {
          id: string;
          licitacion_id: string | null;
          estado: string;
          es_favorita: boolean | null;
          notas: string | null;
          monto_mi_propuesta: number | null;
          margen_porcentaje: number | null;
          proveedor_cotizado: string | null;
          fecha_envio_propuesta: string | null;
          primera_vista_at: string | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          licitacion_id?: string | null;
          estado?: string;
          es_favorita?: boolean | null;
          notas?: string | null;
          monto_mi_propuesta?: number | null;
          margen_porcentaje?: number | null;
          proveedor_cotizado?: string | null;
          fecha_envio_propuesta?: string | null;
          primera_vista_at?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          licitacion_id?: string | null;
          estado?: string;
          es_favorita?: boolean | null;
          notas?: string | null;
          monto_mi_propuesta?: number | null;
          margen_porcentaje?: number | null;
          proveedor_cotizado?: string | null;
          fecha_envio_propuesta?: string | null;
          primera_vista_at?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: {
          foreignKeyName: string;
          columns: string[];
          referencedRelation: string;
          referencedColumns: string[];
        }[];
      };
      licitaciones: {
        Row: {
          id: string;
          codigo: string;
          titulo: string;
          descripcion: string | null;
          organismo: string;
          codigo_organismo: string | null;
          rut_organismo: string | null;
          region: string | null;
          comuna: string | null;
          monto_clp: number;
          monto_utm: number | null;
          categoria: string | null;
          rubro: string | null;
          fecha_publicacion: string;
          fecha_cierre: string;
          fecha_adjudicacion: string | null;
          estado_mp: string;
          url_ficha: string | null;
          es_compra_agil: boolean | null;
          json_raw: Json | null;
          sincronizado_at: string | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          codigo: string;
          titulo: string;
          descripcion?: string | null;
          organismo: string;
          codigo_organismo?: string | null;
          rut_organismo?: string | null;
          region?: string | null;
          comuna?: string | null;
          monto_clp: number;
          monto_utm?: number | null;
          categoria?: string | null;
          rubro?: string | null;
          fecha_publicacion: string;
          fecha_cierre: string;
          fecha_adjudicacion?: string | null;
          estado_mp: string;
          url_ficha?: string | null;
          es_compra_agil?: boolean | null;
          json_raw?: Json | null;
          sincronizado_at?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          codigo?: string;
          titulo?: string;
          descripcion?: string | null;
          organismo?: string;
          codigo_organismo?: string | null;
          rut_organismo?: string | null;
          region?: string | null;
          comuna?: string | null;
          monto_clp?: number;
          monto_utm?: number | null;
          categoria?: string | null;
          rubro?: string | null;
          fecha_publicacion?: string;
          fecha_cierre?: string;
          fecha_adjudicacion?: string | null;
          estado_mp?: string;
          url_ficha?: string | null;
          es_compra_agil?: boolean | null;
          json_raw?: Json | null;
          sincronizado_at?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: {
          foreignKeyName: string;
          columns: string[];
          referencedRelation: string;
          referencedColumns: string[];
        }[];
      };
      keywords: {
        Row: {
          id: string;
          keyword: string;
          activo: boolean | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          keyword: string;
          activo?: boolean | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          keyword?: string;
          activo?: boolean | null;
          created_at?: string | null;
        };
        Relationships: {
          foreignKeyName: string;
          columns: string[];
          referencedRelation: string;
          referencedColumns: string[];
        }[];
      };
      organismos_favoritos: {
        Row: {
          id: string;
          codigo_organismo: string;
          nombre_organismo: string;
          alerta_activa: boolean | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          codigo_organismo: string;
          nombre_organismo: string;
          alerta_activa?: boolean | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          codigo_organismo?: string;
          nombre_organismo?: string;
          alerta_activa?: boolean | null;
          created_at?: string | null;
        };
        Relationships: {
          foreignKeyName: string;
          columns: string[];
          referencedRelation: string;
          referencedColumns: string[];
        }[];
      };
      alertas_log: {
        Row: {
          id: string;
          licitacion_id: string | null;
          tipo_alerta: string;
          detalles: Json | null;
          enviado_at: string | null;
        };
        Insert: {
          id?: string;
          licitacion_id?: string | null;
          tipo_alerta: string;
          detalles?: Json | null;
          enviado_at?: string | null;
        };
        Update: {
          id?: string;
          licitacion_id?: string | null;
          tipo_alerta?: string;
          detalles?: Json | null;
          enviado_at?: string | null;
        };
        Relationships: {
          foreignKeyName: string;
          columns: string[];
          referencedRelation: string;
          referencedColumns: string[];
        }[];
      };
      sync_log: {
        Row: {
          id: string;
          ejecutado_at: string | null;
          duracion_segundos: number | null;
          licitaciones_scrapeadas: number | null;
          licitaciones_nuevas: number | null;
          licitaciones_actualizadas: number | null;
          errores: Json | null;
          exitoso: boolean | null;
        };
        Insert: {
          id?: string;
          ejecutado_at?: string | null;
          duracion_segundos?: number | null;
          licitaciones_scrapeadas?: number | null;
          licitaciones_nuevas?: number | null;
          licitaciones_actualizadas?: number | null;
          errores?: Json | null;
          exitoso?: boolean | null;
        };
        Update: {
          id?: string;
          ejecutado_at?: string | null;
          duracion_segundos?: number | null;
          licitaciones_scrapeadas?: number | null;
          licitaciones_nuevas?: number | null;
          licitaciones_actualizadas?: number | null;
          errores?: Json | null;
          exitoso?: boolean | null;
        };
        Relationships: {
          foreignKeyName: string;
          columns: string[];
          referencedRelation: string;
          referencedColumns: string[];
        }[];
      };
      configuracion: {
        Row: {
          id: string;
          clave: string;
          valor: string;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          clave: string;
          valor: string;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          clave?: string;
          valor?: string;
          updated_at?: string | null;
        };
        Relationships: {
          foreignKeyName: string;
          columns: string[];
          referencedRelation: string;
          referencedColumns: string[];
        }[];
      };
    };
    Views: {
      [key: string]: never;
    };
    Functions: {
      [key: string]: never;
    };
    Enums: {
      [key: string]: never;
    };
    CompositeTypes: {
      [key: string]: never;
    };
  };
};

export type PublicSchema = Database["public"];

export type Tables<
  T extends keyof PublicSchema["Tables"]
> = PublicSchema["Tables"][T]["Row"];

export type TablesInsert<
  T extends keyof PublicSchema["Tables"]
> = PublicSchema["Tables"][T]["Insert"];

export type TablesUpdate<
  T extends keyof PublicSchema["Tables"]
> = PublicSchema["Tables"][T]["Update"];

export type Enums<T extends keyof PublicSchema["Enums"]> =
  PublicSchema["Enums"][T];