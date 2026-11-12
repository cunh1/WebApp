-- Normaliza as contas existentes para que o setor determine o cargo operacional.
-- Administradores mantêm o cargo, independentemente do setor cadastrado.
UPDATE usuarios
   SET setor = CASE
     WHEN cargo = 'ti' THEN 'TI'
     WHEN cargo = 'manutencao' THEN 'Manutenção'
     ELSE setor
   END;

UPDATE usuarios
   SET cargo = CASE
     WHEN cargo = 'admin' THEN 'admin'
     WHEN setor = 'TI' THEN 'ti'
     WHEN setor = 'Manutenção' THEN 'manutencao'
     ELSE 'usuario'
   END,
       papel = CASE WHEN cargo = 'admin' THEN 'admin' ELSE 'usuario' END;
