import { usePendingUsers, useApproveUser, useRejectUser } from '../api/adminApi'

export default function PendingUsersTable() {
  const { data: users, isLoading } = usePendingUsers()
  const approveUser = useApproveUser()
  const rejectUser = useRejectUser()

  if (isLoading) return <p>Loading...</p>
  if (!users || users.length === 0) return <p>No pending users.</p>

  return (
    <table>
      <thead>
        <tr>
          <th>Email</th>
          <th>Status</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {users.map((user) => (
          <tr key={user.id}>
            <td>{user.email}</td>
            <td>{user.status}</td>
            <td>
              <button
                onClick={() => approveUser.mutateAsync(user.id)}
                disabled={approveUser.isPending}
              >
                Approve
              </button>
              <button
                onClick={() => rejectUser.mutateAsync(user.id)}
                disabled={rejectUser.isPending}
              >
                Reject
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
