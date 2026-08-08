-- ============================================================
-- 020 - Fix checklist deficiency CGP reference construction
-- ============================================================
--
-- Migration 019 used:
--   '2022 CGP ... ' || item->>'checklist_item_id'
--
-- PostgreSQL can bind the overloaded JSONB concatenation operator before the
-- JSON text extractor, causing it to parse "2022 CGP ..." as JSON. Replace
-- that expression in the already-installed function. Migration 019 also uses
-- FORMAT directly so clean databases receive the corrected definition.

DO $migration$
DECLARE
  v_definition TEXT;
  v_patched_definition TEXT;
  v_old_expression CONSTANT TEXT :=
    $old$'2022 CGP Part 2 checklist item ' || item->>'checklist_item_id'$old$;
  v_new_expression CONSTANT TEXT :=
    $new$FORMAT('2022 CGP Part 2 checklist item %s', item->>'checklist_item_id')$new$;
BEGIN
  SELECT pg_get_functiondef(
    'public.submit_inspection_checklist(text,jsonb,jsonb)'::REGPROCEDURE
  )
  INTO v_definition;

  -- A clean install already has the fixed FORMAT expression from migration
  -- 019. Existing databases still contain the ambiguous concatenation.
  IF POSITION(v_new_expression IN v_definition) > 0 THEN
    RETURN;
  END IF;

  IF POSITION(v_old_expression IN v_definition) = 0 THEN
    RAISE EXCEPTION
      'submit_inspection_checklist does not contain the expected CGP reference expression';
  END IF;

  v_patched_definition := REPLACE(
    v_definition,
    v_old_expression,
    v_new_expression
  );
  EXECUTE v_patched_definition;
END;
$migration$;

