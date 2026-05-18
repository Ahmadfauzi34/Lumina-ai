sed -i 's/confirm('\''Yakin ingin menghapus obrolan ini?'\'') \&\& onDeleteSession.emit(session.id)/confirmDeleteSession(session.id)/' src/app/components/sidebar.component.ts
sed -i 's/confirm('\''Yakin ingin menghapus file ini?'\'') \&\& deleteFile.emit(path)/confirmDeleteFile(path)/' src/app/components/sidebar.component.ts
