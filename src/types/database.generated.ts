export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      _migrations: {
        Row: {
          applied_at: string
          checksum: string
          duration_ms: number
          filename: string
          mode: string
        }
        Insert: {
          applied_at?: string
          checksum: string
          duration_ms: number
          filename: string
          mode: string
        }
        Update: {
          applied_at?: string
          checksum?: string
          duration_ms?: number
          filename?: string
          mode?: string
        }
        Relationships: []
      }
      activity_events: {
        Row: {
          created_at: string | null
          description: string
          id: string
          linked_entity_id: string | null
          linked_entity_type: string | null
          metadata: Json | null
          project_id: string
          severity: string | null
          timestamp: string
          title: string
          type: string
        }
        Insert: {
          created_at?: string | null
          description: string
          id: string
          linked_entity_id?: string | null
          linked_entity_type?: string | null
          metadata?: Json | null
          project_id: string
          severity?: string | null
          timestamp: string
          title: string
          type: string
        }
        Update: {
          created_at?: string | null
          description?: string
          id?: string
          linked_entity_id?: string | null
          linked_entity_type?: string | null
          metadata?: Json | null
          project_id?: string
          severity?: string | null
          timestamp?: string
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_analyses: {
        Row: {
          cgp_reference: string
          checkpoint_id: string
          confidence: number
          created_at: string | null
          details: Json
          id: number
          recommendations: Json | null
          status: string
          summary: string
        }
        Insert: {
          cgp_reference?: string
          checkpoint_id: string
          confidence: number
          created_at?: string | null
          details?: Json
          id?: number
          recommendations?: Json | null
          status: string
          summary: string
        }
        Update: {
          cgp_reference?: string
          checkpoint_id?: string
          confidence?: number
          created_at?: string | null
          details?: Json
          id?: number
          recommendations?: Json | null
          status?: string
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_analyses_checkpoint_id_fkey"
            columns: ["checkpoint_id"]
            isOneToOne: false
            referencedRelation: "checkpoints"
            referencedColumns: ["id"]
          },
        ]
      }
      bmp_checkpoint_drafts: {
        Row: {
          bmp_category: string
          bmp_code: string
          created_at: string
          document_id: string
          id: number
          inspection_frequency: Json
          is_active: boolean
          maintenance_threshold: string
          project_id: string
          promoted_checkpoint_id: string | null
          required_locations: Json
          reviewed_at: string | null
          reviewed_by: string | null
          title: string
        }
        Insert: {
          bmp_category: string
          bmp_code: string
          created_at?: string
          document_id: string
          id?: number
          inspection_frequency?: Json
          is_active?: boolean
          maintenance_threshold: string
          project_id: string
          promoted_checkpoint_id?: string | null
          required_locations?: Json
          reviewed_at?: string | null
          reviewed_by?: string | null
          title: string
        }
        Update: {
          bmp_category?: string
          bmp_code?: string
          created_at?: string
          document_id?: string
          id?: number
          inspection_frequency?: Json
          is_active?: boolean
          maintenance_threshold?: string
          project_id?: string
          promoted_checkpoint_id?: string | null
          required_locations?: Json
          reviewed_at?: string | null
          reviewed_by?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "bmp_checkpoint_drafts_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "swppp_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bmp_checkpoint_drafts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bmp_checkpoint_drafts_promoted_checkpoint_id_fkey"
            columns: ["promoted_checkpoint_id"]
            isOneToOne: false
            referencedRelation: "checkpoints"
            referencedColumns: ["id"]
          },
        ]
      }
      cgp_checklist_templates: {
        Row: {
          created_at: string
          effective_on: string
          id: string
          item_count: number
          permit_order: string
          project_type: string
          report_part: number
          retired_on: string | null
          risk_level: number
          status: string
          title: string
          version_number: number
        }
        Insert: {
          created_at?: string
          effective_on: string
          id: string
          item_count: number
          permit_order: string
          project_type: string
          report_part?: number
          retired_on?: string | null
          risk_level: number
          status?: string
          title: string
          version_number: number
        }
        Update: {
          created_at?: string
          effective_on?: string
          id?: string
          item_count?: number
          permit_order?: string
          project_type?: string
          report_part?: number
          retired_on?: string | null
          risk_level?: number
          status?: string
          title?: string
          version_number?: number
        }
        Relationships: []
      }
      cgp_forecast_intervals: {
        Row: {
          created_at: string
          ends_at: string
          id: string
          probability_percent: number | null
          project_id: string
          qpf_inches: number | null
          quality_status: string
          sequence_index: number
          snapshot_id: string
          starts_at: string
        }
        Insert: {
          created_at?: string
          ends_at: string
          id: string
          probability_percent?: number | null
          project_id: string
          qpf_inches?: number | null
          quality_status: string
          sequence_index: number
          snapshot_id: string
          starts_at: string
        }
        Update: {
          created_at?: string
          ends_at?: string
          id?: string
          probability_percent?: number | null
          project_id?: string
          qpf_inches?: number | null
          quality_status?: string
          sequence_index?: number
          snapshot_id?: string
          starts_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cgp_forecast_intervals_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cgp_forecast_intervals_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "cgp_forecast_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      cgp_forecast_snapshots: {
        Row: {
          created_at: string
          id: string
          issued_at: string | null
          latitude: number
          longitude: number
          normalization_reason_codes: Json
          normalization_status: string
          parser_version: string
          payload_sha256: string
          project_id: string
          provider: string
          raw_payload: Json
          retrieved_at: string
          site_timezone: string
          source_url: string
        }
        Insert: {
          created_at?: string
          id: string
          issued_at?: string | null
          latitude: number
          longitude: number
          normalization_reason_codes?: Json
          normalization_status: string
          parser_version: string
          payload_sha256: string
          project_id: string
          provider?: string
          raw_payload: Json
          retrieved_at: string
          site_timezone: string
          source_url: string
        }
        Update: {
          created_at?: string
          id?: string
          issued_at?: string | null
          latitude?: number
          longitude?: number
          normalization_reason_codes?: Json
          normalization_status?: string
          parser_version?: string
          payload_sha256?: string
          project_id?: string
          provider?: string
          raw_payload?: Json
          retrieved_at?: string
          site_timezone?: string
          source_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "cgp_forecast_snapshots_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      checkpoints: {
        Row: {
          bmp_type: string
          cgp_section: string
          created_at: string | null
          description: string
          id: string
          install_date: string
          last_inspection_date: string | null
          last_inspection_photo: string | null
          lat: number
          lng: number
          name: string
          previous_photo: string | null
          priority: string
          project_id: string
          qsp_photo_uploaded_at: string | null
          qsp_photo_url: string | null
          segment_id: string | null
          station_label: string | null
          station_number: number | null
          station_offset_feet: number | null
          status: string
          swppp_page: number
          updated_at: string | null
          zone: string | null
        }
        Insert: {
          bmp_type: string
          cgp_section: string
          created_at?: string | null
          description: string
          id: string
          install_date: string
          last_inspection_date?: string | null
          last_inspection_photo?: string | null
          lat: number
          lng: number
          name: string
          previous_photo?: string | null
          priority: string
          project_id: string
          qsp_photo_uploaded_at?: string | null
          qsp_photo_url?: string | null
          segment_id?: string | null
          station_label?: string | null
          station_number?: number | null
          station_offset_feet?: number | null
          status: string
          swppp_page?: number
          updated_at?: string | null
          zone?: string | null
        }
        Update: {
          bmp_type?: string
          cgp_section?: string
          created_at?: string | null
          description?: string
          id?: string
          install_date?: string
          last_inspection_date?: string | null
          last_inspection_photo?: string | null
          lat?: number
          lng?: number
          name?: string
          previous_photo?: string | null
          priority?: string
          project_id?: string
          qsp_photo_uploaded_at?: string | null
          qsp_photo_url?: string | null
          segment_id?: string | null
          station_label?: string | null
          station_number?: number | null
          station_offset_feet?: number | null
          status?: string
          swppp_page?: number
          updated_at?: string | null
          zone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "checkpoints_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkpoints_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "project_segments"
            referencedColumns: ["id"]
          },
        ]
      }
      corrective_actions: {
        Row: {
          cgp_reference: string | null
          checkpoint_id: string | null
          created_at: string
          description: string
          due_date: string
          id: string
          inspection_id: string | null
          mission_id: string | null
          project_id: string
          resolution_notes: string | null
          resolution_photo_url: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          source_analysis_id: string | null
          status: string
          updated_at: string
          waypoint_number: number | null
        }
        Insert: {
          cgp_reference?: string | null
          checkpoint_id?: string | null
          created_at?: string
          description: string
          due_date: string
          id: string
          inspection_id?: string | null
          mission_id?: string | null
          project_id: string
          resolution_notes?: string | null
          resolution_photo_url?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          source_analysis_id?: string | null
          status?: string
          updated_at?: string
          waypoint_number?: number | null
        }
        Update: {
          cgp_reference?: string | null
          checkpoint_id?: string | null
          created_at?: string
          description?: string
          due_date?: string
          id?: string
          inspection_id?: string | null
          mission_id?: string | null
          project_id?: string
          resolution_notes?: string | null
          resolution_photo_url?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          source_analysis_id?: string | null
          status?: string
          updated_at?: string
          waypoint_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "corrective_actions_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "inspections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "corrective_actions_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "drone_missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "corrective_actions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "corrective_actions_source_analysis_id_fkey"
            columns: ["source_analysis_id"]
            isOneToOne: false
            referencedRelation: "mission_ai_analyses"
            referencedColumns: ["id"]
          },
        ]
      }
      crossings: {
        Row: {
          created_at: string | null
          crossing_type: string
          description: string | null
          id: string
          location: Json | null
          name: string
          permits_required: string[] | null
          project_id: string
          segment_id: string | null
          station_label: string | null
          station_number: number | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          crossing_type: string
          description?: string | null
          id: string
          location?: Json | null
          name: string
          permits_required?: string[] | null
          project_id: string
          segment_id?: string | null
          station_label?: string | null
          station_number?: number | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          crossing_type?: string
          description?: string | null
          id?: string
          location?: Json | null
          name?: string
          permits_required?: string[] | null
          project_id?: string
          segment_id?: string | null
          station_label?: string | null
          station_number?: number | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crossings_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crossings_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "project_segments"
            referencedColumns: ["id"]
          },
        ]
      }
      deficiencies: {
        Row: {
          action_implemented_at: string | null
          cgp_violation: string
          checkpoint_id: string | null
          corrective_action: string
          created_at: string | null
          deadline: string
          description: string
          detected_date: string
          id: string
          inspection_checklist_result_id: number | null
          inspection_id: string | null
          project_id: string
          recommendation: string | null
          repair_completed_at: string | null
          repair_start_due_at: string | null
          repair_started_at: string | null
          resolved_date: string | null
          resolved_notes: string | null
          status: string
          updated_at: string | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          action_implemented_at?: string | null
          cgp_violation: string
          checkpoint_id?: string | null
          corrective_action: string
          created_at?: string | null
          deadline: string
          description: string
          detected_date: string
          id: string
          inspection_checklist_result_id?: number | null
          inspection_id?: string | null
          project_id: string
          recommendation?: string | null
          repair_completed_at?: string | null
          repair_start_due_at?: string | null
          repair_started_at?: string | null
          resolved_date?: string | null
          resolved_notes?: string | null
          status: string
          updated_at?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          action_implemented_at?: string | null
          cgp_violation?: string
          checkpoint_id?: string | null
          corrective_action?: string
          created_at?: string | null
          deadline?: string
          description?: string
          detected_date?: string
          id?: string
          inspection_checklist_result_id?: number | null
          inspection_id?: string | null
          project_id?: string
          recommendation?: string | null
          repair_completed_at?: string | null
          repair_start_due_at?: string | null
          repair_started_at?: string | null
          resolved_date?: string | null
          resolved_notes?: string | null
          status?: string
          updated_at?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deficiencies_checklist_result_fk"
            columns: ["inspection_id", "inspection_checklist_result_id"]
            isOneToOne: false
            referencedRelation: "inspection_checklist_results"
            referencedColumns: ["inspection_id", "id"]
          },
          {
            foreignKeyName: "deficiencies_checkpoint_id_fkey"
            columns: ["checkpoint_id"]
            isOneToOne: false
            referencedRelation: "checkpoints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deficiencies_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "inspections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deficiencies_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      drainage_areas: {
        Row: {
          acreage: number | null
          created_at: string
          description: string | null
          id: string
          name: string
          portal_option_value: string | null
          portal_record_id: string | null
          project_id: string
          status: string
          updated_at: string
        }
        Insert: {
          acreage?: number | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          portal_option_value?: string | null
          portal_record_id?: string | null
          project_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          acreage?: number | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          portal_option_value?: string | null
          portal_record_id?: string | null
          project_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "drainage_areas_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      drone_missions: {
        Row: {
          actual_flight_path: Json | null
          altitude: number
          battery_end: number
          battery_start: number
          completed_at: string | null
          created_at: string | null
          date: string
          edited_flight_path: Json | null
          end_of_mission_action: string
          flight_path: Json
          flight_time_minutes: number
          id: string
          inspection_type: string
          last_completed_waypoint: number | null
          manual_override_active: boolean | null
          name: string
          notes: string | null
          project_id: string
          resume_valid: boolean | null
          scope: string
          source_document_pages: Json | null
          status: string
          total_flight_seconds: number | null
          updated_at: string | null
          weather_condition: string | null
          weather_humidity: number | null
          weather_temperature: number | null
          weather_wind_speed_mph: number | null
        }
        Insert: {
          actual_flight_path?: Json | null
          altitude?: number
          battery_end?: number
          battery_start?: number
          completed_at?: string | null
          created_at?: string | null
          date: string
          edited_flight_path?: Json | null
          end_of_mission_action?: string
          flight_path?: Json
          flight_time_minutes?: number
          id: string
          inspection_type: string
          last_completed_waypoint?: number | null
          manual_override_active?: boolean | null
          name: string
          notes?: string | null
          project_id: string
          resume_valid?: boolean | null
          scope?: string
          source_document_pages?: Json | null
          status: string
          total_flight_seconds?: number | null
          updated_at?: string | null
          weather_condition?: string | null
          weather_humidity?: number | null
          weather_temperature?: number | null
          weather_wind_speed_mph?: number | null
        }
        Update: {
          actual_flight_path?: Json | null
          altitude?: number
          battery_end?: number
          battery_start?: number
          completed_at?: string | null
          created_at?: string | null
          date?: string
          edited_flight_path?: Json | null
          end_of_mission_action?: string
          flight_path?: Json
          flight_time_minutes?: number
          id?: string
          inspection_type?: string
          last_completed_waypoint?: number | null
          manual_override_active?: boolean | null
          name?: string
          notes?: string | null
          project_id?: string
          resume_valid?: boolean | null
          scope?: string
          source_document_pages?: Json | null
          status?: string
          total_flight_seconds?: number | null
          updated_at?: string | null
          weather_condition?: string | null
          weather_humidity?: number | null
          weather_temperature?: number | null
          weather_wind_speed_mph?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "drone_missions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      geofences: {
        Row: {
          ceiling_feet: number | null
          created_at: string | null
          floor_feet: number | null
          id: string
          name: string
          notes: string | null
          polygon: Json
          project_id: string
          source: string
          updated_at: string | null
        }
        Insert: {
          ceiling_feet?: number | null
          created_at?: string | null
          floor_feet?: number | null
          id: string
          name: string
          notes?: string | null
          polygon: Json
          project_id: string
          source?: string
          updated_at?: string | null
        }
        Update: {
          ceiling_feet?: number | null
          created_at?: string | null
          floor_feet?: number | null
          id?: string
          name?: string
          notes?: string | null
          polygon?: Json
          project_id?: string
          source?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "geofences_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      inspection_checklist_results: {
        Row: {
          action_implemented_at: string | null
          answer: string
          answer_source: string
          category_number: number
          category_title: string
          checklist_item_id: string
          checklist_template_id: string
          checkpoint_id_snapshot: string | null
          exception_description: string | null
          id: number
          identified_at: string | null
          inspection_id: string
          item_number: number
          location_snapshot: string | null
          photo_urls: Json
          prompt: string
          recommendation: string | null
          recorded_at: string
          repair_start_due_at: string | null
        }
        Insert: {
          action_implemented_at?: string | null
          answer: string
          answer_source: string
          category_number: number
          category_title: string
          checklist_item_id: string
          checklist_template_id: string
          checkpoint_id_snapshot?: string | null
          exception_description?: string | null
          id?: number
          identified_at?: string | null
          inspection_id: string
          item_number: number
          location_snapshot?: string | null
          photo_urls?: Json
          prompt: string
          recommendation?: string | null
          recorded_at?: string
          repair_start_due_at?: string | null
        }
        Update: {
          action_implemented_at?: string | null
          answer?: string
          answer_source?: string
          category_number?: number
          category_title?: string
          checklist_item_id?: string
          checklist_template_id?: string
          checkpoint_id_snapshot?: string | null
          exception_description?: string | null
          id?: number
          identified_at?: string | null
          inspection_id?: string
          item_number?: number
          location_snapshot?: string | null
          photo_urls?: Json
          prompt?: string
          recommendation?: string | null
          recorded_at?: string
          repair_start_due_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inspection_results_inspection_template_fk"
            columns: ["inspection_id", "checklist_template_id"]
            isOneToOne: false
            referencedRelation: "inspections"
            referencedColumns: ["id", "checklist_template_id"]
          },
          {
            foreignKeyName: "inspection_results_master_item_fk"
            columns: ["checklist_template_id", "checklist_item_id"]
            isOneToOne: false
            referencedRelation: "master_checklist_items"
            referencedColumns: ["checklist_template_id", "item_id"]
          },
        ]
      }
      inspection_findings: {
        Row: {
          checkpoint_id: string
          created_at: string | null
          id: number
          inspection_id: string
          notes: string
          status: string
        }
        Insert: {
          checkpoint_id: string
          created_at?: string | null
          id?: number
          inspection_id: string
          notes?: string
          status: string
        }
        Update: {
          checkpoint_id?: string
          created_at?: string | null
          id?: number
          inspection_id?: string
          notes?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "inspection_findings_checkpoint_id_fkey"
            columns: ["checkpoint_id"]
            isOneToOne: false
            referencedRelation: "checkpoints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspection_findings_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "inspections"
            referencedColumns: ["id"]
          },
        ]
      }
      inspection_missions: {
        Row: {
          added_at: string
          id: string
          inspection_id: string
          mission_id: string
        }
        Insert: {
          added_at?: string
          id: string
          inspection_id: string
          mission_id: string
        }
        Update: {
          added_at?: string
          id?: string
          inspection_id?: string
          mission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inspection_missions_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "inspections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspection_missions_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "drone_missions"
            referencedColumns: ["id"]
          },
        ]
      }
      inspections: {
        Row: {
          ai_overall_compliance: number | null
          checklist_attested_by_name: string | null
          checklist_compliant_count: number | null
          checklist_deficient_count: number | null
          checklist_observed_at: string | null
          checklist_submission_key: string | null
          checklist_submission_sha256: string | null
          checklist_template_id: string | null
          construction_stage_snapshot: string | null
          created_at: string | null
          date: string
          due_by: string | null
          exemption_documentation: string | null
          id: string
          inspector: string
          inspector_title_snapshot: string | null
          mission_id: string | null
          narrative: string | null
          obs_discolorations: boolean | null
          obs_floating_material: boolean | null
          obs_odors: boolean | null
          obs_precipitation: boolean | null
          obs_sheen: boolean | null
          obs_suspended_material: boolean | null
          obs_turbidity: boolean | null
          observation_comments: string | null
          overall_compliance: number
          photos_taken: boolean | null
          project_id: string
          qpe_duration_hours: number | null
          qpe_end: string | null
          qpe_start: string | null
          qsp_company_snapshot: string | null
          qsp_license_number_snapshot: string | null
          qsp_overall_compliance: number | null
          rain_gauge_inches: number | null
          report_id: string | null
          risk_level_snapshot: number | null
          segment_id: string | null
          site_name_snapshot: string | null
          station_range_end: number | null
          station_range_start: number | null
          status: string
          submitted_at: string | null
          trigger: string
          trigger_event_id: string | null
          type: string
          unflagged_items_confirmed: boolean
          unflagged_items_confirmed_at: string | null
          unflagged_items_confirmed_by: string | null
          updated_at: string | null
          wdid_snapshot: string | null
          weather_condition: string
          weather_humidity: number
          weather_temperature: number
          weather_wind_speed_mph: number
        }
        Insert: {
          ai_overall_compliance?: number | null
          checklist_attested_by_name?: string | null
          checklist_compliant_count?: number | null
          checklist_deficient_count?: number | null
          checklist_observed_at?: string | null
          checklist_submission_key?: string | null
          checklist_submission_sha256?: string | null
          checklist_template_id?: string | null
          construction_stage_snapshot?: string | null
          created_at?: string | null
          date: string
          due_by?: string | null
          exemption_documentation?: string | null
          id: string
          inspector: string
          inspector_title_snapshot?: string | null
          mission_id?: string | null
          narrative?: string | null
          obs_discolorations?: boolean | null
          obs_floating_material?: boolean | null
          obs_odors?: boolean | null
          obs_precipitation?: boolean | null
          obs_sheen?: boolean | null
          obs_suspended_material?: boolean | null
          obs_turbidity?: boolean | null
          observation_comments?: string | null
          overall_compliance: number
          photos_taken?: boolean | null
          project_id: string
          qpe_duration_hours?: number | null
          qpe_end?: string | null
          qpe_start?: string | null
          qsp_company_snapshot?: string | null
          qsp_license_number_snapshot?: string | null
          qsp_overall_compliance?: number | null
          rain_gauge_inches?: number | null
          report_id?: string | null
          risk_level_snapshot?: number | null
          segment_id?: string | null
          site_name_snapshot?: string | null
          station_range_end?: number | null
          station_range_start?: number | null
          status?: string
          submitted_at?: string | null
          trigger?: string
          trigger_event_id?: string | null
          type: string
          unflagged_items_confirmed?: boolean
          unflagged_items_confirmed_at?: string | null
          unflagged_items_confirmed_by?: string | null
          updated_at?: string | null
          wdid_snapshot?: string | null
          weather_condition?: string
          weather_humidity?: number
          weather_temperature?: number
          weather_wind_speed_mph?: number
        }
        Update: {
          ai_overall_compliance?: number | null
          checklist_attested_by_name?: string | null
          checklist_compliant_count?: number | null
          checklist_deficient_count?: number | null
          checklist_observed_at?: string | null
          checklist_submission_key?: string | null
          checklist_submission_sha256?: string | null
          checklist_template_id?: string | null
          construction_stage_snapshot?: string | null
          created_at?: string | null
          date?: string
          due_by?: string | null
          exemption_documentation?: string | null
          id?: string
          inspector?: string
          inspector_title_snapshot?: string | null
          mission_id?: string | null
          narrative?: string | null
          obs_discolorations?: boolean | null
          obs_floating_material?: boolean | null
          obs_odors?: boolean | null
          obs_precipitation?: boolean | null
          obs_sheen?: boolean | null
          obs_suspended_material?: boolean | null
          obs_turbidity?: boolean | null
          observation_comments?: string | null
          overall_compliance?: number
          photos_taken?: boolean | null
          project_id?: string
          qpe_duration_hours?: number | null
          qpe_end?: string | null
          qpe_start?: string | null
          qsp_company_snapshot?: string | null
          qsp_license_number_snapshot?: string | null
          qsp_overall_compliance?: number | null
          rain_gauge_inches?: number | null
          report_id?: string | null
          risk_level_snapshot?: number | null
          segment_id?: string | null
          site_name_snapshot?: string | null
          station_range_end?: number | null
          station_range_start?: number | null
          status?: string
          submitted_at?: string | null
          trigger?: string
          trigger_event_id?: string | null
          type?: string
          unflagged_items_confirmed?: boolean
          unflagged_items_confirmed_at?: string | null
          unflagged_items_confirmed_by?: string | null
          updated_at?: string | null
          wdid_snapshot?: string | null
          weather_condition?: string
          weather_humidity?: number
          weather_temperature?: number
          weather_wind_speed_mph?: number
        }
        Relationships: [
          {
            foreignKeyName: "inspections_checklist_template_id_fkey"
            columns: ["checklist_template_id"]
            isOneToOne: false
            referencedRelation: "cgp_checklist_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspections_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "drone_missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspections_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspections_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspections_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "project_segments"
            referencedColumns: ["id"]
          },
        ]
      }
      inspector_profiles: {
        Row: {
          created_at: string
          display_name: string
          license_number: string | null
          org_id: string
          phone: string | null
          status: string
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name: string
          license_number?: string | null
          org_id: string
          phone?: string | null
          status?: string
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string
          license_number?: string | null
          org_id?: string
          phone?: string | null
          status?: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inspector_profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspector_profiles_user_id_org_id_fkey"
            columns: ["user_id", "org_id"]
            isOneToOne: false
            referencedRelation: "org_memberships"
            referencedColumns: ["user_id", "org_id"]
          },
        ]
      }
      master_checklist_items: {
        Row: {
          category_number: number
          category_title: string
          checklist_template_id: string
          created_at: string
          item_id: string
          item_number: number
          prompt: string
        }
        Insert: {
          category_number: number
          category_title: string
          checklist_template_id: string
          created_at?: string
          item_id: string
          item_number: number
          prompt: string
        }
        Update: {
          category_number?: number
          category_title?: string
          checklist_template_id?: string
          created_at?: string
          item_id?: string
          item_number?: number
          prompt?: string
        }
        Relationships: [
          {
            foreignKeyName: "master_checklist_items_checklist_template_id_fkey"
            columns: ["checklist_template_id"]
            isOneToOne: false
            referencedRelation: "cgp_checklist_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_ai_analyses: {
        Row: {
          cgp_reference: string
          checkpoint_id: string
          confidence: number
          created_at: string | null
          details: Json
          id: string
          mission_id: string
          model: string
          photo_url: string
          raw_response: Json | null
          recommendations: Json | null
          status: string
          summary: string
          waypoint_number: number
        }
        Insert: {
          cgp_reference?: string
          checkpoint_id: string
          confidence: number
          created_at?: string | null
          details?: Json
          id: string
          mission_id: string
          model?: string
          photo_url: string
          raw_response?: Json | null
          recommendations?: Json | null
          status: string
          summary: string
          waypoint_number: number
        }
        Update: {
          cgp_reference?: string
          checkpoint_id?: string
          confidence?: number
          created_at?: string | null
          details?: Json
          id?: string
          mission_id?: string
          model?: string
          photo_url?: string
          raw_response?: Json | null
          recommendations?: Json | null
          status?: string
          summary?: string
          waypoint_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "mission_ai_analyses_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "drone_missions"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_qsp_reviews: {
        Row: {
          ai_analysis_id: string | null
          checkpoint_id: string
          decision: string
          id: string
          mission_id: string
          override_notes: string | null
          override_status: string | null
          reviewed_at: string | null
          waypoint_number: number
        }
        Insert: {
          ai_analysis_id?: string | null
          checkpoint_id: string
          decision: string
          id: string
          mission_id: string
          override_notes?: string | null
          override_status?: string | null
          reviewed_at?: string | null
          waypoint_number: number
        }
        Update: {
          ai_analysis_id?: string | null
          checkpoint_id?: string
          decision?: string
          id?: string
          mission_id?: string
          override_notes?: string | null
          override_status?: string | null
          reviewed_at?: string | null
          waypoint_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "mission_qsp_reviews_ai_analysis_id_fkey"
            columns: ["ai_analysis_id"]
            isOneToOne: false
            referencedRelation: "mission_ai_analyses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mission_qsp_reviews_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "drone_missions"
            referencedColumns: ["id"]
          },
        ]
      }
      monitoring_locations: {
        Row: {
          coordinate_datum: string
          created_at: string
          description: string | null
          discharge_point_type: string
          drainage_area: string
          drainage_area_id: string | null
          id: string
          is_ats: boolean
          is_passive_treatment: boolean
          latitude: number | null
          longitude: number | null
          name: string
          portal_option_value: string | null
          portal_record_id: string | null
          project_id: string
          status: string
          updated_at: string
          water_body: string | null
        }
        Insert: {
          coordinate_datum?: string
          created_at?: string
          description?: string | null
          discharge_point_type: string
          drainage_area: string
          drainage_area_id?: string | null
          id: string
          is_ats?: boolean
          is_passive_treatment?: boolean
          latitude?: number | null
          longitude?: number | null
          name: string
          portal_option_value?: string | null
          portal_record_id?: string | null
          project_id: string
          status?: string
          updated_at?: string
          water_body?: string | null
        }
        Update: {
          coordinate_datum?: string
          created_at?: string
          description?: string | null
          discharge_point_type?: string
          drainage_area?: string
          drainage_area_id?: string | null
          id?: string
          is_ats?: boolean
          is_passive_treatment?: boolean
          latitude?: number | null
          longitude?: number | null
          name?: string
          portal_option_value?: string | null
          portal_record_id?: string | null
          project_id?: string
          status?: string
          updated_at?: string
          water_body?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "monitoring_locations_drainage_area_project_fk"
            columns: ["drainage_area_id", "project_id"]
            isOneToOne: false
            referencedRelation: "drainage_areas"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "monitoring_locations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      nofly_zones: {
        Row: {
          active: boolean
          category: string
          ceiling_feet: number | null
          created_at: string | null
          description: string | null
          floor_feet: number | null
          id: string
          name: string
          polygon: Json
          project_id: string
          source: string | null
          updated_at: string | null
        }
        Insert: {
          active?: boolean
          category: string
          ceiling_feet?: number | null
          created_at?: string | null
          description?: string | null
          floor_feet?: number | null
          id: string
          name: string
          polygon: Json
          project_id: string
          source?: string | null
          updated_at?: string | null
        }
        Update: {
          active?: boolean
          category?: string
          ceiling_feet?: number | null
          created_at?: string | null
          description?: string | null
          floor_feet?: number | null
          id?: string
          name?: string
          polygon?: Json
          project_id?: string
          source?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nofly_zones_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string | null
          id: string
          link: string | null
          message: string
          project_id: string
          read: boolean
          timestamp: string
          title: string
          type: string
        }
        Insert: {
          created_at?: string | null
          id: string
          link?: string | null
          message: string
          project_id: string
          read?: boolean
          timestamp: string
          title: string
          type: string
        }
        Update: {
          created_at?: string | null
          id?: string
          link?: string | null
          message?: string
          project_id?: string
          read?: boolean
          timestamp?: string
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      org_memberships: {
        Row: {
          created_at: string
          id: string
          org_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          org_id: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_memberships_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
          plan: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          plan?: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          plan?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      parameter_results: {
        Row: {
          analytical_method: string
          analyzed_by: string
          created_at: string
          id: string
          mdl: number | null
          parameter: string
          project_id: string
          qualifier: string
          result: number | null
          rl: number | null
          sample_id: string
          units: string
          updated_at: string
        }
        Insert: {
          analytical_method: string
          analyzed_by?: string
          created_at?: string
          id: string
          mdl?: number | null
          parameter: string
          project_id: string
          qualifier?: string
          result?: number | null
          rl?: number | null
          sample_id: string
          units: string
          updated_at?: string
        }
        Update: {
          analytical_method?: string
          analyzed_by?: string
          created_at?: string
          id?: string
          mdl?: number | null
          parameter?: string
          project_id?: string
          qualifier?: string
          result?: number | null
          rl?: number | null
          sample_id?: string
          units?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "parameter_results_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parameter_results_sample_id_fkey"
            columns: ["sample_id"]
            isOneToOne: false
            referencedRelation: "samples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parameter_results_sample_project_fk"
            columns: ["sample_id", "project_id"]
            isOneToOne: false
            referencedRelation: "samples"
            referencedColumns: ["id", "project_id"]
          },
        ]
      }
      project_inspector_assignments: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          assignment_role: string
          ended_at: string | null
          id: string
          inspector_user_id: string
          org_id: string
          project_id: string
          status: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          assignment_role?: string
          ended_at?: string | null
          id?: string
          inspector_user_id: string
          org_id: string
          project_id: string
          status?: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          assignment_role?: string
          ended_at?: string | null
          id?: string
          inspector_user_id?: string
          org_id?: string
          project_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_inspector_assignments_org_id_inspector_user_id_fkey"
            columns: ["org_id", "inspector_user_id"]
            isOneToOne: false
            referencedRelation: "inspector_profiles"
            referencedColumns: ["org_id", "user_id"]
          },
          {
            foreignKeyName: "project_inspector_assignments_org_id_project_id_fkey"
            columns: ["org_id", "project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["org_id", "id"]
          },
        ]
      }
      project_segments: {
        Row: {
          centerline_slice: Json | null
          created_at: string | null
          end_station: number
          id: string
          name: string
          project_id: string
          sort_order: number | null
          start_station: number
        }
        Insert: {
          centerline_slice?: Json | null
          created_at?: string | null
          end_station: number
          id: string
          name: string
          project_id: string
          sort_order?: number | null
          start_station: number
        }
        Update: {
          centerline_slice?: Json | null
          created_at?: string | null
          end_station?: number
          id?: string
          name?: string
          project_id?: string
          sort_order?: number | null
          start_station?: number
        }
        Relationships: [
          {
            foreignKeyName: "project_segments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          acreage: number
          address: string
          bounds_ne_lat: number | null
          bounds_ne_lng: number | null
          bounds_sw_lat: number | null
          bounds_sw_lng: number | null
          center_lat: number
          center_lng: number
          corridor_centerline: Json | null
          corridor_linear_unit: string | null
          corridor_total_length: number | null
          corridor_width_feet: number | null
          created_at: string | null
          estimated_completion: string
          id: string
          linear_mileage: number | null
          name: string
          org_id: string
          permit_number: string
          project_type: string
          qsp_company: string
          qsp_email: string
          qsp_license_number: string
          qsp_name: string
          qsp_phone: string
          risk_level: number
          row_easement_description: string | null
          row_left_boundary: Json | null
          row_right_boundary: Json | null
          row_width_feet: number | null
          start_date: string
          status: string
          updated_at: string | null
          wdid: string
        }
        Insert: {
          acreage: number
          address: string
          bounds_ne_lat?: number | null
          bounds_ne_lng?: number | null
          bounds_sw_lat?: number | null
          bounds_sw_lng?: number | null
          center_lat: number
          center_lng: number
          corridor_centerline?: Json | null
          corridor_linear_unit?: string | null
          corridor_total_length?: number | null
          corridor_width_feet?: number | null
          created_at?: string | null
          estimated_completion: string
          id: string
          linear_mileage?: number | null
          name: string
          org_id: string
          permit_number: string
          project_type?: string
          qsp_company: string
          qsp_email: string
          qsp_license_number: string
          qsp_name: string
          qsp_phone: string
          risk_level: number
          row_easement_description?: string | null
          row_left_boundary?: Json | null
          row_right_boundary?: Json | null
          row_width_feet?: number | null
          start_date: string
          status: string
          updated_at?: string | null
          wdid: string
        }
        Update: {
          acreage?: number
          address?: string
          bounds_ne_lat?: number | null
          bounds_ne_lng?: number | null
          bounds_sw_lat?: number | null
          bounds_sw_lng?: number | null
          center_lat?: number
          center_lng?: number
          corridor_centerline?: Json | null
          corridor_linear_unit?: string | null
          corridor_total_length?: number | null
          corridor_width_feet?: number | null
          created_at?: string | null
          estimated_completion?: string
          id?: string
          linear_mileage?: number | null
          name?: string
          org_id?: string
          permit_number?: string
          project_type?: string
          qsp_company?: string
          qsp_email?: string
          qsp_license_number?: string
          qsp_name?: string
          qsp_phone?: string
          risk_level?: number
          row_easement_description?: string | null
          row_left_boundary?: Json | null
          row_right_boundary?: Json | null
          row_width_feet?: number | null
          start_date?: string
          status?: string
          updated_at?: string | null
          wdid?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      qp_events: {
        Row: {
          created_at: string | null
          end_date: string
          id: string
          inspection_id: string | null
          inspection_triggered: boolean
          project_id: string
          start_date: string
          total_precipitation: number
        }
        Insert: {
          created_at?: string | null
          end_date: string
          id: string
          inspection_id?: string | null
          inspection_triggered?: boolean
          project_id: string
          start_date: string
          total_precipitation: number
        }
        Update: {
          created_at?: string | null
          end_date?: string
          id?: string
          inspection_id?: string | null
          inspection_triggered?: boolean
          project_id?: string
          start_date?: string
          total_precipitation?: number
        }
        Relationships: [
          {
            foreignKeyName: "qp_events_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "inspections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qp_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      qsp_profiles: {
        Row: {
          company: string
          created_at: string
          email: string
          license_number: string
          name: string
          phone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          company?: string
          created_at?: string
          email?: string
          license_number?: string
          name?: string
          phone?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          company?: string
          created_at?: string
          email?: string
          license_number?: string
          name?: string
          phone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      reports: {
        Row: {
          created_at: string | null
          generated_date: string
          id: string
          inspection_id: string | null
          project_id: string
          sections: Json
          signed: boolean
          signed_by: string | null
          signed_date: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          generated_date?: string
          id: string
          inspection_id?: string | null
          project_id: string
          sections?: Json
          signed?: boolean
          signed_by?: string | null
          signed_date?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          generated_date?: string
          id?: string
          inspection_id?: string | null
          project_id?: string
          sections?: Json
          signed?: boolean
          signed_by?: string | null
          signed_date?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reports_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "inspections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      samples: {
        Row: {
          created_at: string
          id: string
          monitoring_location_id: string
          portal_sample_id: string | null
          project_id: string
          qsp_name: string
          sample_datetime: string
          smarts_event_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          monitoring_location_id: string
          portal_sample_id?: string | null
          project_id: string
          qsp_name: string
          sample_datetime: string
          smarts_event_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          monitoring_location_id?: string
          portal_sample_id?: string | null
          project_id?: string
          qsp_name?: string
          sample_datetime?: string
          smarts_event_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "samples_event_project_fk"
            columns: ["smarts_event_id", "project_id"]
            isOneToOne: false
            referencedRelation: "smarts_events"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "samples_location_project_fk"
            columns: ["monitoring_location_id", "project_id"]
            isOneToOne: false
            referencedRelation: "monitoring_locations"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "samples_monitoring_location_id_fkey"
            columns: ["monitoring_location_id"]
            isOneToOne: false
            referencedRelation: "monitoring_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "samples_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "samples_smarts_event_id_fkey"
            columns: ["smarts_event_id"]
            isOneToOne: false
            referencedRelation: "smarts_events"
            referencedColumns: ["id"]
          },
        ]
      }
      segment_permits: {
        Row: {
          agency: string | null
          created_at: string | null
          crossing_id: string | null
          expiration_date: string | null
          id: string
          issued_date: string | null
          notes: string | null
          permit_number: string | null
          permit_type: string
          project_id: string
          segment_id: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          agency?: string | null
          created_at?: string | null
          crossing_id?: string | null
          expiration_date?: string | null
          id: string
          issued_date?: string | null
          notes?: string | null
          permit_number?: string | null
          permit_type: string
          project_id: string
          segment_id?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          agency?: string | null
          created_at?: string | null
          crossing_id?: string | null
          expiration_date?: string | null
          id?: string
          issued_date?: string | null
          notes?: string | null
          permit_number?: string | null
          permit_type?: string
          project_id?: string
          segment_id?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "segment_permits_crossing_id_fkey"
            columns: ["crossing_id"]
            isOneToOne: false
            referencedRelation: "crossings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "segment_permits_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "segment_permits_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "project_segments"
            referencedColumns: ["id"]
          },
        ]
      }
      site_record_inspections: {
        Row: {
          created_at: string
          inspection_id: string
          project_id: string
          site_record_id: string
        }
        Insert: {
          created_at?: string
          inspection_id: string
          project_id: string
          site_record_id: string
        }
        Update: {
          created_at?: string
          inspection_id?: string
          project_id?: string
          site_record_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_record_inspections_inspection_id_project_id_fkey"
            columns: ["inspection_id", "project_id"]
            isOneToOne: false
            referencedRelation: "inspections"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "site_record_inspections_site_record_id_project_id_fkey"
            columns: ["site_record_id", "project_id"]
            isOneToOne: false
            referencedRelation: "site_record_directory"
            referencedColumns: ["site_record_id", "project_id"]
          },
          {
            foreignKeyName: "site_record_inspections_site_record_id_project_id_fkey"
            columns: ["site_record_id", "project_id"]
            isOneToOne: false
            referencedRelation: "site_records"
            referencedColumns: ["id", "project_id"]
          },
        ]
      }
      site_record_sources: {
        Row: {
          captured_at: string
          captured_by: string
          id: string
          payload_sha256: string | null
          project_id: string
          raw_payload: Json | null
          schema_version: string
          site_record_id: string
          source_type: string
          upload_id: string | null
        }
        Insert: {
          captured_at?: string
          captured_by: string
          id?: string
          payload_sha256?: string | null
          project_id: string
          raw_payload?: Json | null
          schema_version: string
          site_record_id: string
          source_type: string
          upload_id?: string | null
        }
        Update: {
          captured_at?: string
          captured_by?: string
          id?: string
          payload_sha256?: string | null
          project_id?: string
          raw_payload?: Json | null
          schema_version?: string
          site_record_id?: string
          source_type?: string
          upload_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "site_record_sources_site_record_id_project_id_fkey"
            columns: ["site_record_id", "project_id"]
            isOneToOne: false
            referencedRelation: "site_record_directory"
            referencedColumns: ["site_record_id", "project_id"]
          },
          {
            foreignKeyName: "site_record_sources_site_record_id_project_id_fkey"
            columns: ["site_record_id", "project_id"]
            isOneToOne: false
            referencedRelation: "site_records"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "site_record_sources_upload_id_site_record_id_project_id_fkey"
            columns: ["upload_id", "site_record_id", "project_id"]
            isOneToOne: false
            referencedRelation: "site_record_uploads"
            referencedColumns: ["id", "site_record_id", "project_id"]
          },
        ]
      }
      site_record_status_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          context: Json
          from_status: string | null
          id: number
          project_id: string
          reason: string | null
          site_record_id: string
          to_status: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          context?: Json
          from_status?: string | null
          id?: number
          project_id: string
          reason?: string | null
          site_record_id: string
          to_status: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          context?: Json
          from_status?: string | null
          id?: number
          project_id?: string
          reason?: string | null
          site_record_id?: string
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_record_status_history_site_record_id_project_id_fkey"
            columns: ["site_record_id", "project_id"]
            isOneToOne: false
            referencedRelation: "site_record_directory"
            referencedColumns: ["site_record_id", "project_id"]
          },
          {
            foreignKeyName: "site_record_status_history_site_record_id_project_id_fkey"
            columns: ["site_record_id", "project_id"]
            isOneToOne: false
            referencedRelation: "site_records"
            referencedColumns: ["id", "project_id"]
          },
        ]
      }
      site_record_uploads: {
        Row: {
          byte_size: number
          content_type: string
          created_at: string
          file_role: string
          id: string
          original_filename: string
          project_id: string
          sha256: string
          site_record_id: string
          storage_bucket: string
          storage_path: string
          upload_status: string
          uploaded_by: string
        }
        Insert: {
          byte_size: number
          content_type: string
          created_at?: string
          file_role: string
          id?: string
          original_filename: string
          project_id: string
          sha256: string
          site_record_id: string
          storage_bucket?: string
          storage_path: string
          upload_status?: string
          uploaded_by: string
        }
        Update: {
          byte_size?: number
          content_type?: string
          created_at?: string
          file_role?: string
          id?: string
          original_filename?: string
          project_id?: string
          sha256?: string
          site_record_id?: string
          storage_bucket?: string
          storage_path?: string
          upload_status?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_record_uploads_site_record_id_project_id_fkey"
            columns: ["site_record_id", "project_id"]
            isOneToOne: false
            referencedRelation: "site_record_directory"
            referencedColumns: ["site_record_id", "project_id"]
          },
          {
            foreignKeyName: "site_record_uploads_site_record_id_project_id_fkey"
            columns: ["site_record_id", "project_id"]
            isOneToOne: false
            referencedRelation: "site_records"
            referencedColumns: ["id", "project_id"]
          },
        ]
      }
      site_records: {
        Row: {
          created_at: string
          created_by: string
          id: string
          idempotency_key: string
          inspector_user_id: string
          observed_from: string | null
          observed_to: string | null
          org_id: string
          project_id: string
          record_type: string
          title: string | null
          updated_at: string
          workflow_status: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          idempotency_key: string
          inspector_user_id: string
          observed_from?: string | null
          observed_to?: string | null
          org_id: string
          project_id: string
          record_type: string
          title?: string | null
          updated_at?: string
          workflow_status?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          idempotency_key?: string
          inspector_user_id?: string
          observed_from?: string | null
          observed_to?: string | null
          org_id?: string
          project_id?: string
          record_type?: string
          title?: string | null
          updated_at?: string
          workflow_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_records_org_id_project_id_fkey"
            columns: ["org_id", "project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "site_records_org_id_project_id_inspector_user_id_fkey"
            columns: ["org_id", "project_id", "inspector_user_id"]
            isOneToOne: false
            referencedRelation: "project_inspector_assignments"
            referencedColumns: ["org_id", "project_id", "inspector_user_id"]
          },
        ]
      }
      smarts_attachments: {
        Row: {
          attachment_type: string
          created_at: string
          id: string
          portal_attachment_id: string | null
          portal_filename: string
          portal_status: string
          project_id: string
          site_record_id: string
          upload_id: string
          uploaded_to_portal_at: string | null
        }
        Insert: {
          attachment_type?: string
          created_at?: string
          id?: string
          portal_attachment_id?: string | null
          portal_filename: string
          portal_status?: string
          project_id: string
          site_record_id: string
          upload_id: string
          uploaded_to_portal_at?: string | null
        }
        Update: {
          attachment_type?: string
          created_at?: string
          id?: string
          portal_attachment_id?: string | null
          portal_filename?: string
          portal_status?: string
          project_id?: string
          site_record_id?: string
          upload_id?: string
          uploaded_to_portal_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "smarts_attachments_site_record_id_project_id_fkey"
            columns: ["site_record_id", "project_id"]
            isOneToOne: false
            referencedRelation: "smarts_report_records"
            referencedColumns: ["site_record_id", "project_id"]
          },
          {
            foreignKeyName: "smarts_attachments_upload_id_site_record_id_project_id_fkey"
            columns: ["upload_id", "site_record_id", "project_id"]
            isOneToOne: false
            referencedRelation: "site_record_uploads"
            referencedColumns: ["id", "site_record_id", "project_id"]
          },
        ]
      }
      smarts_credentials: {
        Row: {
          created_at: string
          password_ciphertext: string
          updated_at: string
          user_id: string
          username: string
        }
        Insert: {
          created_at?: string
          password_ciphertext: string
          updated_at?: string
          user_id: string
          username: string
        }
        Update: {
          created_at?: string
          password_ciphertext?: string
          updated_at?: string
          user_id?: string
          username?: string
        }
        Relationships: []
      }
      smarts_events: {
        Row: {
          created_at: string
          ended_at: string | null
          forecast_detected_at: string
          id: string
          notes: string | null
          precipitation_inches: number | null
          project_id: string
          source: string
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          ended_at?: string | null
          forecast_detected_at?: string
          id: string
          notes?: string | null
          precipitation_inches?: number | null
          project_id: string
          source?: string
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          ended_at?: string | null
          forecast_detected_at?: string
          id?: string
          notes?: string | null
          precipitation_inches?: number | null
          project_id?: string
          source?: string
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "smarts_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      smarts_payload_versions: {
        Row: {
          created_at: string
          created_by: string
          id: string
          normalized_payload: Json
          payload_sha256: string
          project_id: string
          schema_version: string
          site_record_id: string
          version_number: number
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          normalized_payload: Json
          payload_sha256: string
          project_id: string
          schema_version: string
          site_record_id: string
          version_number: number
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          normalized_payload?: Json
          payload_sha256?: string
          project_id?: string
          schema_version?: string
          site_record_id?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "smarts_payload_versions_site_record_id_project_id_fkey"
            columns: ["site_record_id", "project_id"]
            isOneToOne: false
            referencedRelation: "smarts_report_records"
            referencedColumns: ["site_record_id", "project_id"]
          },
        ]
      }
      smarts_report_records: {
        Row: {
          created_at: string
          portal_report_id: string | null
          portal_status: string | null
          project_id: string
          readback_checked_at: string | null
          readback_payload: Json | null
          readback_status: string
          reporting_year_start: number
          site_record_id: string
          smarts_event_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          portal_report_id?: string | null
          portal_status?: string | null
          project_id: string
          readback_checked_at?: string | null
          readback_payload?: Json | null
          readback_status?: string
          reporting_year_start: number
          site_record_id: string
          smarts_event_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          portal_report_id?: string | null
          portal_status?: string | null
          project_id?: string
          readback_checked_at?: string | null
          readback_payload?: Json | null
          readback_status?: string
          reporting_year_start?: number
          site_record_id?: string
          smarts_event_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "smarts_report_records_site_record_id_project_id_fkey"
            columns: ["site_record_id", "project_id"]
            isOneToOne: true
            referencedRelation: "site_record_directory"
            referencedColumns: ["site_record_id", "project_id"]
          },
          {
            foreignKeyName: "smarts_report_records_site_record_id_project_id_fkey"
            columns: ["site_record_id", "project_id"]
            isOneToOne: true
            referencedRelation: "site_records"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "smarts_report_records_smarts_event_id_project_id_fkey"
            columns: ["smarts_event_id", "project_id"]
            isOneToOne: false
            referencedRelation: "smarts_events"
            referencedColumns: ["id", "project_id"]
          },
        ]
      }
      smarts_runs: {
        Row: {
          bot_version: string | null
          completed_at: string | null
          csv_text: string | null
          error_message: string | null
          id: string
          job_id: string
          last_step_reached: string | null
          payload_version_id: string | null
          portal_report_id: string | null
          project_id: string
          readback_status: string | null
          readback_summary: Json | null
          reporting_year_start: number | null
          selector_version: string | null
          site_record_id: string | null
          started_at: string
          status: string
          user_id: string
          wdid: string | null
        }
        Insert: {
          bot_version?: string | null
          completed_at?: string | null
          csv_text?: string | null
          error_message?: string | null
          id?: string
          job_id: string
          last_step_reached?: string | null
          payload_version_id?: string | null
          portal_report_id?: string | null
          project_id: string
          readback_status?: string | null
          readback_summary?: Json | null
          reporting_year_start?: number | null
          selector_version?: string | null
          site_record_id?: string | null
          started_at?: string
          status?: string
          user_id: string
          wdid?: string | null
        }
        Update: {
          bot_version?: string | null
          completed_at?: string | null
          csv_text?: string | null
          error_message?: string | null
          id?: string
          job_id?: string
          last_step_reached?: string | null
          payload_version_id?: string | null
          portal_report_id?: string | null
          project_id?: string
          readback_status?: string | null
          readback_summary?: Json | null
          reporting_year_start?: number | null
          selector_version?: string | null
          site_record_id?: string | null
          started_at?: string
          status?: string
          user_id?: string
          wdid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "smarts_runs_payload_site_record_project_fk"
            columns: ["payload_version_id", "site_record_id", "project_id"]
            isOneToOne: false
            referencedRelation: "smarts_payload_versions"
            referencedColumns: ["id", "site_record_id", "project_id"]
          },
          {
            foreignKeyName: "smarts_runs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "smarts_runs_site_record_project_fk"
            columns: ["site_record_id", "project_id"]
            isOneToOne: false
            referencedRelation: "smarts_report_records"
            referencedColumns: ["site_record_id", "project_id"]
          },
        ]
      }
      swppp_documents: {
        Row: {
          bmp_count: number | null
          error_message: string | null
          extracted_qsp_name: string | null
          extracted_risk_level: string | null
          extracted_wdid: string | null
          file_url: string | null
          filename: string
          id: string
          indexed_chunks: number | null
          page_count: number | null
          pdf_backend: string | null
          project_id: string
          raw_markdown: string | null
          status: string
          updated_at: string
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          bmp_count?: number | null
          error_message?: string | null
          extracted_qsp_name?: string | null
          extracted_risk_level?: string | null
          extracted_wdid?: string | null
          file_url?: string | null
          filename: string
          id: string
          indexed_chunks?: number | null
          page_count?: number | null
          pdf_backend?: string | null
          project_id: string
          raw_markdown?: string | null
          status?: string
          updated_at?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          bmp_count?: number | null
          error_message?: string | null
          extracted_qsp_name?: string | null
          extracted_risk_level?: string | null
          extracted_wdid?: string | null
          file_url?: string | null
          filename?: string
          id?: string
          indexed_chunks?: number | null
          page_count?: number | null
          pdf_backend?: string | null
          project_id?: string
          raw_markdown?: string | null
          status?: string
          updated_at?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "swppp_documents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      waypoints: {
        Row: {
          actual_altitude: number | null
          actual_lat: number | null
          actual_lng: number | null
          altitude_override: number | null
          arrival_time: string
          capture_mode: string | null
          capture_status: string
          captured_at: string | null
          checkpoint_id: string
          created_at: string | null
          enabled: boolean
          hover_time_seconds: number | null
          id: number
          lat: number
          lng: number
          mission_id: string
          number: number
          operator_notes: string | null
          photo: string | null
          photos: Json | null
          sort_order: number | null
        }
        Insert: {
          actual_altitude?: number | null
          actual_lat?: number | null
          actual_lng?: number | null
          altitude_override?: number | null
          arrival_time: string
          capture_mode?: string | null
          capture_status: string
          captured_at?: string | null
          checkpoint_id: string
          created_at?: string | null
          enabled?: boolean
          hover_time_seconds?: number | null
          id?: number
          lat: number
          lng: number
          mission_id: string
          number: number
          operator_notes?: string | null
          photo?: string | null
          photos?: Json | null
          sort_order?: number | null
        }
        Update: {
          actual_altitude?: number | null
          actual_lat?: number | null
          actual_lng?: number | null
          altitude_override?: number | null
          arrival_time?: string
          capture_mode?: string | null
          capture_status?: string
          captured_at?: string | null
          checkpoint_id?: string
          created_at?: string | null
          enabled?: boolean
          hover_time_seconds?: number | null
          id?: number
          lat?: number
          lng?: number
          mission_id?: string
          number?: number
          operator_notes?: string | null
          photo?: string | null
          photos?: Json | null
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "waypoints_checkpoint_id_fkey"
            columns: ["checkpoint_id"]
            isOneToOne: false
            referencedRelation: "checkpoints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waypoints_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "drone_missions"
            referencedColumns: ["id"]
          },
        ]
      }
      weather_forecasts: {
        Row: {
          condition: string
          date: string
          fetched_at: string | null
          high: number
          humidity: number
          id: number
          is_qpe: boolean
          low: number
          precipitation_chance: number
          precipitation_inches: number
          project_id: string
          wind_direction: string
          wind_speed_mph: number
        }
        Insert: {
          condition: string
          date: string
          fetched_at?: string | null
          high: number
          humidity: number
          id?: number
          is_qpe?: boolean
          low: number
          precipitation_chance?: number
          precipitation_inches?: number
          project_id: string
          wind_direction?: string
          wind_speed_mph: number
        }
        Update: {
          condition?: string
          date?: string
          fetched_at?: string | null
          high?: number
          humidity?: number
          id?: number
          is_qpe?: boolean
          low?: number
          precipitation_chance?: number
          precipitation_inches?: number
          project_id?: string
          wind_direction?: string
          wind_speed_mph?: number
        }
        Relationships: [
          {
            foreignKeyName: "weather_forecasts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      weather_snapshots: {
        Row: {
          condition: string
          fetched_at: string | null
          humidity: number
          id: number
          project_id: string
          temperature: number
          wind_speed_mph: number
        }
        Insert: {
          condition: string
          fetched_at?: string | null
          humidity: number
          id?: number
          project_id: string
          temperature: number
          wind_speed_mph: number
        }
        Update: {
          condition?: string
          fetched_at?: string | null
          humidity?: number
          id?: number
          project_id?: string
          temperature?: number
          wind_speed_mph?: number
        }
        Relationships: [
          {
            foreignKeyName: "weather_snapshots_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      site_record_directory: {
        Row: {
          assignment_role: string | null
          company_name: string | null
          created_at: string | null
          created_by: string | null
          inspection_id: string | null
          inspector_name: string | null
          inspector_title: string | null
          inspector_user_id: string | null
          observed_from: string | null
          observed_to: string | null
          org_id: string | null
          portal_report_id: string | null
          portal_status: string | null
          project_id: string | null
          readback_status: string | null
          record_type: string | null
          reporting_year_start: number | null
          site_name: string | null
          site_record_id: string | null
          smarts_event_id: string | null
          title: string | null
          updated_at: string | null
          wdid: string | null
          workflow_status: string | null
        }
        Relationships: [
          {
            foreignKeyName: "site_records_org_id_project_id_fkey"
            columns: ["org_id", "project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "site_records_org_id_project_id_inspector_user_id_fkey"
            columns: ["org_id", "project_id", "inspector_user_id"]
            isOneToOne: false
            referencedRelation: "project_inspector_assignments"
            referencedColumns: ["org_id", "project_id", "inspector_user_id"]
          },
        ]
      }
    }
    Functions: {
      auth_user_org_ids: { Args: never; Returns: string[] }
      auth_user_project_ids: { Args: never; Returns: string[] }
      capture_cgp_forecast_evidence: {
        Args: { p_intervals: Json; p_snapshot: Json }
        Returns: string
      }
      create_site_record_with_detail: {
        Args: {
          p_detail?: Json
          p_idempotency_key: string
          p_observed_from?: string
          p_observed_to?: string
          p_project_id: string
          p_record_type: string
          p_source?: Json
          p_title?: string
        }
        Returns: Json
      }
      submit_inspection_checklist: {
        Args: { p_inspection_id: string; p_results: Json; p_submission: Json }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const

